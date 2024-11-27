
import { stat } from "fs/promises";
import path from "path";
import { extensions } from "vscode";
import IBMi from "../../api/IBMi";
import { ComponentState, IBMiComponent } from "../component";

export class CustomQSh implements IBMiComponent {
  static ID = "cqsh";
  installPath = "";

  getIdentification() {
    return { name: CustomQSh.ID, version: 1 };
  }

  getFileName() {
    const id = this.getIdentification();
    return `${id.name}_${id.version}`;
  }

  async getRemoteState(connection: IBMi, installDirectory: string): Promise<ComponentState> {
    this.installPath = path.posix.join(installDirectory, this.getFileName());
    const result = await connection.content.testStreamFile(this.installPath, "x");

    if (!result) {
      return `NotInstalled`;
    }

    const testResult = await this.testCommand(connection);

    if (!testResult) {
      return `Error`;
    }

    return `Installed`;
  }

  async update(connection: IBMi): Promise<ComponentState> {
    const extensionPath = extensions.getExtension(`halcyontechltd.code-for-ibmi`)!.extensionPath;

    const assetPath = path.join(extensionPath, `dist`, this.getFileName());
    const assetExistsLocally = await exists(assetPath);

    if (!assetExistsLocally) {
      return `Error`;
    }

    await connection.uploadFiles([{ local: assetPath, remote: this.installPath }]);

    await connection.sendCommand({
      command: `chmod +x ${this.installPath}`,
    });

    const testResult = await this.testCommand(connection);

    if (!testResult) {
      return `Error`;
    }

    return `Installed`;
  }

  async testCommand(connection: IBMi) {
    const text = `Hello world`;
    const result = await connection.sendCommand({
      stdin: `echo "${text}"`,
      command: this.installPath,
    });

    if (result.code !== 0 || result.stdout !== text) {
      return false;
    }

    return true;
  }
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (e) {
    return false;
  }
}