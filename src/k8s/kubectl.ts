import process from "node:process";
import { spawn } from "node:child_process";

export const kubectlApply = (def: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const kubectlProcess = spawn("kubectl", ["apply", "-f", "-", "-o", "json"]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    kubectlProcess.stdout.on('data', (data) => {
      stdout.push(data);
    });

    kubectlProcess.stderr.on('data', (data) => {
      stderr.push(data);
    });

    kubectlProcess.on('close', (code) => {
      if (code !== 0) {
        console.log('stdout:', Buffer.concat(stdout).toString('utf-8'));
        console.log('stderr:', Buffer.concat(stderr).toString('utf-8'));
        reject(Buffer.concat(stderr).toString('utf-8'));
      } else {
        resolve(JSON.parse(Buffer.concat(stdout).toString('utf-8')));
      }
    });

    kubectlProcess.stdin.write(JSON.stringify(def));
    kubectlProcess.stdin.end();
  });
};

export const kubectl = (...args: string[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    const kubectlProcess = spawn("kubectl", args);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    // kubectlProcess.stdout.pipe(process.stdout, { end: false });
    // kubectlProcess.stderr.pipe(process.stderr, { end: false });

    kubectlProcess.stdout.on('data', (data) => {
      stdout.push(data);
    });

    kubectlProcess.stderr.on('data', (data) => {
      stderr.push(data);
    });

    kubectlProcess.on('close', (code) => {
      if (code !== 0) {
        reject(Buffer.concat(stderr).toString('utf-8'));
      } else {
        resolve(Buffer.concat(stdout).toString('utf-8'));
      }
    });

    kubectlProcess.stdin.end();
  });
};