import { FileChange } from "../types";

export function parseUnifiedDiff(files: FileChange[]): FileChange[] {
  return files.map((file) => {
    if (!file.patch || file.status === "deleted") return file;

    const lines = file.patch.split("\n");
    const updatedLines: string[] = [];
    let newLineNum = 0;
    let lineOffset = 0;

    for (const line of lines) {
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        newLineNum = parseInt(hunkMatch[1], 10);
        lineOffset = 0;
        updatedLines.push(line); // keep hunk line
        continue;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        const actualLineNumber = newLineNum + lineOffset;
        updatedLines.push(`${line} // LINE_NUMBER: ${actualLineNumber}`);
        lineOffset++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        updatedLines.push(line); // deleted line
      } else {
        updatedLines.push(line); // context line
        lineOffset++;
      }
    }

    return {
      ...file,
      patch: updatedLines.join("\n"),
    };
  });
}
