import process from "node:process";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import Bluebird from "bluebird";
import { kubectlApply } from "./kubectl.js";

const spwanForwardProcess = (...args: string[]) => {
  return new Bluebird<void>((resolve, reject, onCancel) => {
    const kubectlProcess = spawn("kubectl", ["port-forward", ...args]);

    kubectlProcess.stdout.on("data", (data) => {
      process.stdout.write(`kubectl: ${data}`);
    });

    kubectlProcess.stderr.on("data", (data) => {
      process.stderr.write(`kubectl: ${data}`);
    });

    kubectlProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });

    onCancel!(() => {
      if (!kubectlProcess.killed) {
        kubectlProcess.kill();
      }
    });
  });
};

export const portForwardAuto = (
  namespace: string,
  dest: string,
  targetPort: number | string
): Promise<{ childProcess: ChildProcessWithoutNullStreams, port: number }> => {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const childProcess = spawn("kubectl", [
      "port-forward",
      "-n",
      namespace,
      dest,
      `:${targetPort}`,
    ]);

    // childProcess.stdout.pipe(process.stdout, { end: false });
    // childProcess.stderr.pipe(process.stderr, { end: false });

    const logRegexp = new RegExp(
      `^Forwarding from 127.0.0.1:([0-9]+) -> (.*)\n$`
    );

    const onData = (data: Buffer) => {
      if (resolved) {
        return;
      }

      const line = data.toString("utf-8");
      const elems = logRegexp.exec(line);
      console.log(line, elems);
      if (elems !== null) {
        childProcess.stdout.off("data", onData);

        const port = parseInt(elems[1], 10);
        if (Number.isNaN(port)) {
          if (!resolved) {
            resolved = true;
            reject(new Error("unable to parse port"));
            return
          }
        }

        if (!resolved) {
          resolved = true;
          resolve({ childProcess, port });
        }
      }
    };

    childProcess.stdout.on("data", onData);
  });
};

export const portForward = (
  namespace: string,
  service: string,
  port: number,
  targetPort: number
) => {
  console.warn("portForward is deprecated. Please use portForwardAuto instead.");

  let run = true;

  const createProcess = () => {
    const process = spwanForwardProcess(
      "-n",
      namespace,
      `svc/${service}`,
      `${port}:${targetPort}`
    );
    process.finally(() => {
      if (run) {
        Bluebird.delay(5_000).then(createProcess);
      }
    });
    return process;
  };

  let process = createProcess();

  return new Bluebird<void>((resolve, reject, onCancel) => {
    onCancel!(() => {
      run = false;
      if (!process.isResolved) {
        process.cancel();
      }
    });
  });
};

export const createNamespace = (namespace: string) =>
  kubectlApply({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
    },
  });