import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./parseUnifiedDiff";
import { FileChange } from "../types";

describe("parseUnifiedDiff", () => {
  describe("basic functionality", () => {
    it("should return empty array for empty input", () => {
      const result = parseUnifiedDiff([]);
      expect(result).toEqual([]);
    });

    it("should handle file with no patch", () => {
      const files: FileChange[] = [
        {
          filename: "src/unchanged.ts",
          status: "modified",
          additions: 0,
          deletions: 0,
        },
      ];
      const result = parseUnifiedDiff(files);
      expect(result[0].patch).toBeUndefined();
    });

    it("should skip deleted files", () => {
      const files: FileChange[] = [
        {
          filename: "src/deleted.ts",
          status: "deleted",
          additions: 0,
          deletions: 20,
          patch: "diff content here",
        },
      ];
      const result = parseUnifiedDiff(files);
      expect(result[0].patch).toBe("diff content here");
    });
  });

  describe("line number annotation", () => {
    it("should annotate added lines with line numbers", () => {
      const files: FileChange[] = [
        {
          filename: "src/utils.ts",
          status: "added",
          additions: 3,
          deletions: 0,
          patch: `@@ -0,0 +1,3 @@
+line one
+line two
+line three`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines[0]).toBe("@@ -0,0 +1,3 @@");
      expect(lines[1]).toBe("+line one // LINE_NUMBER: 1");
      expect(lines[2]).toBe("+line two // LINE_NUMBER: 2");
      expect(lines[3]).toBe("+line three // LINE_NUMBER: 3");
    });

    it("should handle multiple hunks correctly", () => {
      const files: FileChange[] = [
        {
          filename: "src/app.ts",
          status: "modified",
          additions: 6,
          deletions: 2,
          patch: `@@ -1,5 +1,5 @@
 context line
-old line
+new line 1
+new line 2
 context line
 context line
@@ -20,3 +20,5 @@
 context line
-old line 2
+new line 3
+new line 4
+new line 5`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      // First hunk starts at line 1
      expect(lines).toContain("+new line 1 // LINE_NUMBER: 2");
      expect(lines).toContain("+new line 2 // LINE_NUMBER: 3");

      // Second hunk starts at line 20
      expect(lines).toContain("+new line 3 // LINE_NUMBER: 21");
      expect(lines).toContain("+new line 4 // LINE_NUMBER: 22");
      expect(lines).toContain("+new line 5 // LINE_NUMBER: 23");
    });

    it("should handle context lines without annotation", () => {
      const files: FileChange[] = [
        {
          filename: "src/file.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: `@@ -5,5 +5,6 @@
 context line 1
 context line 2
+added line
 context line 3
 context line 4`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines[1]).toBe(" context line 1");
      expect(lines[2]).toBe(" context line 2");
      expect(lines[3]).toBe("+added line // LINE_NUMBER: 7");
      expect(lines[4]).toBe(" context line 3");
    });

    it("should handle deleted lines without line numbers", () => {
      const files: FileChange[] = [
        {
          filename: "src/file.ts",
          status: "modified",
          additions: 0,
          deletions: 2,
          patch: `@@ -10,5 +8,3 @@
 context line
-deleted line 1
-deleted line 2
 context line`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines).toContain("-deleted line 1");
      expect(lines).toContain("-deleted line 2");
      expect(lines[2]).not.toContain("LINE_NUMBER");
      expect(lines[3]).not.toContain("LINE_NUMBER");
    });
  });

  describe("hunk header parsing", () => {
    it("should parse hunk header with single line addition", () => {
      const files: FileChange[] = [
        {
          filename: "src/single.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: `@@ -10 +10,2 @@
 context
+added`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines[0]).toBe("@@ -10 +10,2 @@");
      // Line 10 is context, added line is at line 11
      expect(lines[2]).toBe("+added // LINE_NUMBER: 11");
    });

    it("should parse hunk header starting at line 1", () => {
      const files: FileChange[] = [
        {
          filename: "src/start.ts",
          status: "modified",
          additions: 2,
          deletions: 0,
          patch: `@@ -0,0 +1,2 @@
+first
+second`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines[1]).toBe("+first // LINE_NUMBER: 1");
      expect(lines[2]).toBe("+second // LINE_NUMBER: 2");
    });

    it("should reset line offset for each hunk", () => {
      const files: FileChange[] = [
        {
          filename: "src/multi.ts",
          status: "modified",
          additions: 4,
          deletions: 0,
          patch: `@@ -1,3 +1,5 @@
 line1
+added1
+added2
 line2
 line3
@@ -50,3 +52,5 @@
 line50
+added3
+added4
 line51
 line52`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      // First hunk
      expect(lines).toContain("+added1 // LINE_NUMBER: 2");
      expect(lines).toContain("+added2 // LINE_NUMBER: 3");

      // Second hunk should start at 53
      expect(lines).toContain("+added3 // LINE_NUMBER: 53");
      expect(lines).toContain("+added4 // LINE_NUMBER: 54");
    });
  });

  describe("edge cases", () => {
    it("should handle file paths with special characters", () => {
      const files: FileChange[] = [
        {
          filename: "src/components/my-component.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: `@@ -1,2 +1,3 @@
 import React from 'react';
+import { useEffect } from 'react';
 export function Component() {},
`,
        },
      ];

      const result = parseUnifiedDiff(files);
      expect(result[0].filename).toBe("src/components/my-component.ts");
      expect(result[0].patch).toContain("LINE_NUMBER: 2");
    });

    it("should handle empty lines in patches", () => {
      const files: FileChange[] = [
        {
          filename: "src/spacing.ts",
          status: "modified",
          additions: 2,
          deletions: 0,
          patch: `@@ -1,3 +1,5 @@
 line1
+
+line between
 line2`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      expect(lines[2]).toBe("+ // LINE_NUMBER: 2");
      expect(lines[3]).toBe("+line between // LINE_NUMBER: 3");
    });

    it("should preserve original file metadata", () => {
      const files: FileChange[] = [
        {
          filename: "src/test.ts",
          status: "renamed",
          additions: 1,
          deletions: 1,
          previousFilename: "src/old-test.ts",
          patch: `@@ -1,1 +1,1 @@
-old
+new`,
        },
      ];

      const result = parseUnifiedDiff(files);
      expect(result[0].filename).toBe("src/test.ts");
      expect(result[0].status).toBe("renamed");
      expect(result[0].previousFilename).toBe("src/old-test.ts");
      expect(result[0].additions).toBe(1);
      expect(result[0].deletions).toBe(1);
    });

    it("should handle multiple files in a single call", () => {
      const files: FileChange[] = [
        {
          filename: "src/file1.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: `@@ -1,1 +1,2 @@
 line1
+added`,
        },
        {
          filename: "src/file2.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: `@@ -5,1 +5,2 @@
 line5
+added here`,
        },
      ];

      const result = parseUnifiedDiff(files);
      expect(result).toHaveLength(2);
      expect(result[0].patch).toContain("LINE_NUMBER: 2");
      // Line 5 is context, added line is at line 6
      expect(result[1].patch).toContain("LINE_NUMBER: 6");
    });

    it("should handle lines starting with +++ or --- (diff metadata)", () => {
      const files: FileChange[] = [
        {
          filename: "src/file.ts",
          status: "modified",
          additions: 0,
          deletions: 0,
          patch: `--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,3 @@
 context
-old
+new`,
        },
      ];

      const result = parseUnifiedDiff(files);
      const lines = result[0].patch?.split("\n") ?? [];

      // These should not be annotated as added lines
      expect(lines[0]).toBe("--- a/src/file.ts");
      expect(lines[1]).toBe("+++ b/src/file.ts");
      expect(lines[0]).not.toContain("LINE_NUMBER");
      expect(lines[1]).not.toContain("LINE_NUMBER");
    });
  });
});
