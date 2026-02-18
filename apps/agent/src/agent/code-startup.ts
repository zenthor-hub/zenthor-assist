export interface CodeMaintenanceAlignmentInput {
  codeAwarenessEnabled?: boolean;
  codeMaintenanceMode?: boolean;
}

export function shouldWarnForCodeMaintenanceAlignment(
  input: CodeMaintenanceAlignmentInput,
): boolean {
  return input.codeMaintenanceMode === true && input.codeAwarenessEnabled !== true;
}
