export type PitPushStepKind = "ssh" | "scp";

export interface PitPushTarget {
  host: string;
  localFiles: string[];
  remoteDirectory: string;
  reloadCommand?: string;
}

export interface PitPushStep {
  kind: PitPushStepKind;
  label: string;
  command: string;
}

export interface PitPushPlan {
  requiresRuntimeRecompile: false;
  steps: PitPushStep[];
}

const SAFE_HOST_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;
const SAFE_REMOTE_DIRECTORY_PATTERN = /^\/[a-zA-Z0-9._/-]+$/;

function validateTarget(target: PitPushTarget): void {
  if (!SAFE_HOST_PATTERN.test(target.host)) {
    throw new Error("Unsafe PIT push host");
  }

  if (!SAFE_REMOTE_DIRECTORY_PATTERN.test(target.remoteDirectory)) {
    throw new Error("Unsafe PIT push remote directory");
  }
}

export function buildPitPushPlan(target: PitPushTarget): PitPushPlan {
  validateTarget(target);

  const steps: PitPushStep[] = [
    {
      kind: "ssh",
      label: "Ensure PIT watch directory exists",
      command: `ssh ${target.host} "mkdir -p ${target.remoteDirectory}"`
    },
    ...target.localFiles.map((localFile): PitPushStep => ({
      kind: "scp",
      label: `Copy ${localFile}`,
      command: `scp ${localFile} ${target.host}:${target.remoteDirectory}/`
    }))
  ];

  if (target.reloadCommand) {
    steps.push({
      kind: "ssh",
      label: "Signal PIT to reload page data",
      command: `ssh ${target.host} "${target.reloadCommand}"`
    });
  }

  return {
    requiresRuntimeRecompile: false,
    steps
  };
}
