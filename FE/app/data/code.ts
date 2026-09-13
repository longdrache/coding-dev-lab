export const codeLines = [
  { text: "// Bắt đầu hành trình của bạn", color: "text-gray-500" },
  { text: "function solveProblem(arr) {", color: "text-cyanx-400" },
  { text: "  const result = arr", color: "text-gray-300" },
  { text: "    .filter(x => x % 2 === 0)", color: "text-accent-400" },
  { text: "    .map(x => x * 2)", color: "text-accent-400" },
  { text: "    .reduce((sum, x) => sum + x, 0);", color: "text-cyanx-400" },
  { text: "  return result;", color: "text-gray-300" },
  { text: "}", color: "text-cyanx-400" },
  { text: "", color: "" },
  { text: "// Chạy thử", color: "text-gray-500" },
  { text: "console.log(solveProblem([1,2,3,4,5,6]));", color: "text-gray-300" },
  { text: "// → 24 ✅ Test passed!", color: "text-accent-400" },
];
