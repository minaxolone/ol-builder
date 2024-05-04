import { Config } from "../config/config.interface.js";
import { kubectlApply } from "../k8s/kubectl.js";

export async function createContainerRegistrySecret(
  config: Config,
  namespace: string
) {
  await kubectlApply({
    apiVersion: "v1",
    kind: "Secret",
    type: "kubernetes.io/dockerconfigjson",
    metadata: {
      name: "docker-config",
      namespace,
    },
    data: {
      ".dockerconfigjson": Buffer.from(
        JSON.stringify({
          auths: {
            "ghcr.io": {
              auth: Buffer.from(
                `${config.github.username}:${config.github.token}`,
                "utf-8"
              ).toString("base64"),
            },
          },
        }),
        "utf-8"
      ).toString("base64"),
    },
  });
}
