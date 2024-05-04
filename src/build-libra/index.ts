import { spawn } from "node:child_process";

import Listr from "listr";
import Bluebird from "bluebird";

import { createNamespace } from "../k8s/index.js";
import { createContainerRegistrySecret } from "../container-registry/index.js";
import { Config } from "../config/config.interface.js";
import { kubectl, kubectlApply } from "../k8s/kubectl.js";

const IMAGE_NAME = "ghcr.io/minaxolone/libra";
const BUILD_POD_NAME = "libra-builder";

export function buildLibra(config: Config): Listr {
  const buildId = '2b64422861c2e518';
  // const buildId = crypto.randomBytes(8).toString("hex");

  // Name of the dedicated Kubernetes namespace for the build
  const namespace = `libra-builder-${buildId}`;

  // Libra commit hash
  const commitHash = "9e9ecb52f38d524e33d298111aed81eb9cf07f7d";
  const pkgVersion = "7.0.2";
  const buildTimestamp = new Date().toISOString();
  const gitBranch = "main";
  const commitTimestamp = "2024-05-02T22:14:37.000Z"

  // Final docker image tag
  let imageTag = "";

  return new Listr(
    [
      // Creating the temporary namespace
      {
        skip: () => true,
        title: "Namespace",
        task: async () => {
          await createNamespace(namespace);
        },
      },

      // Populating namespace secrets
      {
        skip: () => true,
        title: "Secrets",
        task: async () => {
          // Creating the container registry credentials
          await createContainerRegistrySecret(config, namespace);
        },
      },

      // Creating the volume to transfer the compiled binary between the
      // build pod and the Kaniko pod.
      {
        skip: () => true,
        title: "Persistent Volume Claim",
        task: () => createPersistentVolumeClaim(namespace),
      },

      // Creating the build pod
      {
        skip: () => true,
        title: "Starting build pod",
        task: async () => {
          await createBuildPod(namespace);
        },
      },

      // Install builder dependencies
      {
        title: "Installing Builder Dependencies",
        skip: () => true,
        task: async () => {
          await kubectlExec(
            BUILD_POD_NAME,
            "-n",
            namespace,
            "--",
            "bash",
            "-c",
            `
              apt update
              apt install -y \\
                build-essential curl \\
                unzip git \\
                pkg-config libssl-dev libgmp-dev \\
                clang lld
            `
          );
        },
      },

      // Compiling Libra
      {
        title: "Building Libra",
        skip: () => true,
        task: async () => {
          await kubectlExec(
            BUILD_POD_NAME,
            "-n",
            namespace,
            "--",
            "bash",
            "-c",
            `
              set -ex

              COMMIT_HASH="${commitHash}"

              # Disable incremental compilation to avoid overhead. We are not preserving these files anyway.
              export CARGO_INCREMENTAL="0"

              # Disable full debug symbol generation to speed up CI build
              # "1" means line tables only, which is useful for panic tracebacks.
              export CARGO_PROFILE_DEV_DEBUG="1"

              # https://github.com/rust-lang/cargo/issues/10280
              export CARGO_NET_GIT_FETCH_WITH_CLI="true"

              # Building job will be killed in docker for using to much ram.
              # By using only one job, we limit the ram usage.
              # ENV CARGO_BUILD_JOBS="1"

              export RUSTUP_HOME=/usr/local/rustup
              export CARGO_HOME=/usr/local/cargo
              export PATH=/usr/local/cargo/bin:$PATH

              curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

              curl -OL https://github.com/0LNetworkCommunity/libra-framework/archive/$COMMIT_HASH.zip
              unzip $COMMIT_HASH.zip

              cd libra-framework-$COMMIT_HASH

              # https://github.com/aptos-labs/aptos-core/issues/5655
              export RUSTFLAGS="--cfg tokio_unstable"

              export CARGO_PKG_VERSION="${pkgVersion}"
              export VERGEN_BUILD_TIMESTAMP="${buildTimestamp}"
              export VERGEN_GIT_BRANCH="${gitBranch}"
              export VERGEN_GIT_SHA="${commitHash}"
              export VERGEN_GIT_COMMIT_TIMESTAMP="${commitTimestamp}"

              # cargo build \\
              #   --package="libra" \\
              #   --profile="release"

              # cp ./target/release/libra /output/libra

              # echo 'FROM ubuntu:22.04' > /output/Dockerfile
              # echo 'COPY ./libra /bin/libra' >> /output/Dockerfile
              # echo 'CMD ["libra"]' >> /output/Dockerfile
            `
          );
        },
      },

      // Deleting the build pod in order to be able to mount the volume to the Kaniko pod
      {
        title: "Deleting Build Pod",
        task: async () => {
          await kubectl("delete", "pod", "-n", namespace, BUILD_POD_NAME);
        },
      },

      // Creating the docker image with Kaniko
      {
        title: "Building docker image",
        task: async () => {
          imageTag = await createKanikoPod(namespace, commitHash);

          console.log(imageTag);
        },
      },

    ],
    {
      renderer: "verbose",
    }
  );
}

async function createBuildPod(namespace: string) {
  const def = {
    kind: "Pod",
    apiVersion: "v1",
    metadata: {
      name: BUILD_POD_NAME,
      namespace,
    },
    spec: {
      volumes: [
        {
          name: "output-pvc",
          persistentVolumeClaim: {
            claimName: "libra-build",
          },
        },
      ],
      containers: [
        {
          name: "builder",
          image: "ubuntu:22.04",
          command: ["sleep", "infinity"],
          volumeMounts: [
            {
              name: "output-pvc",
              mountPath: "/output",
            },
          ],
        },
      ],
      restartPolicy: "Never",
    },
  };

  await kubectlApply(def);

  while (true) {
    const res = JSON.parse(
      await kubectl("get", "pod", "-n", namespace, BUILD_POD_NAME, "-o", "json")
    );
    const status = res.status.phase;
    if (status === "Running") {
      break;
    }
    await Bluebird.delay(2_000);
  }
}

function createPersistentVolumeClaim(namespace: string) {
  return kubectlApply({
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: "libra-build",
      namespace,
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      resources: { requests: { storage: "5Gi" } },
    },
  });
}

const createKanikoPod = async (
  namespace: string,
  commitHash: string
): Promise<string> => {
  const podName = "libra-kaniko";
  const imageTag = `${IMAGE_NAME}:${commitHash}`;

  const def = {
    kind: "Pod",
    apiVersion: "v1",
    metadata: {
      name: podName,
      namespace: namespace,
    },
    spec: {
      restartPolicy: "Never",
      volumes: [
        {
          name: "kaniko-secret",
          secret: {
            secretName: "docker-config",
            items: [
              {
                key: ".dockerconfigjson",
                path: "config.json",
              },
            ],
          },
        },
        {
          name: "output-pvc",
          persistentVolumeClaim: {
            claimName: "libra-build",
          },
        },
      ],
      containers: [
        {
          name: "kaniko",
          image: "gcr.io/kaniko-project/executor:latest",
          args: [
            "--dockerfile",
            "/output/Dockerfile",
            "--context",
            "/output",
            "--destination",
            imageTag,
          ],
          volumeMounts: [
            {
              name: "kaniko-secret",
              mountPath: "/kaniko/.docker",
            },
            {
              name: "output-pvc",
              mountPath: "/output",
            },
          ],
        },
      ],
    },
  };

  await kubectlApply(def);

  while (true) {
    const res = JSON.parse(
      await kubectl("get", "pod", "-n", namespace, podName, "-o", "json")
    );
    const status = res.status.phase;
    if (status === "Succeeded") {
      break;
    }
    await Bluebird.delay(2_000);
  }

  return imageTag;
};

function kubectlExec(...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const kubectlProcess = spawn("kubectl", ["exec", ...args]);

    kubectlProcess.stdout.pipe(process.stdout, { end: false });
    kubectlProcess.stderr.pipe(process.stderr, { end: false });

    kubectlProcess.on("close", (code) => {
      if (code !== 0) {
        reject();
      } else {
        resolve();
      }
    });

    kubectlProcess.stdin.end();
  });
}

