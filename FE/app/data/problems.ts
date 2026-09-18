export type Difficulty = "Dễ" | "Trung bình" | "Khó";

export type ProblemExample = {
  input: string;
  output: string;
  explanation?: string;
};

export type ProblemTest = {
  stdin: string;
  expected: string;
};

export type Problem = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  /** khớp với slug trong app/data/topics.ts */
  topic: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: ProblemExample[];
  tests: ProblemTest[];
  /** test ẩn chỉ dùng khi nộp bài — không hiện input/expected cho user */
  hiddenTests: ProblemTest[];
};

export const problems: Problem[] = [
  {
    slug: "two-sum",
    title: "Hai số có tổng bằng mục tiêu",
    difficulty: "Dễ",
    topic: "array",
    description:
      "Cho một mảng gồm n số nguyên và một số mục tiêu target. Hãy tìm chỉ số của hai số trong mảng sao cho tổng của chúng bằng target. Giả thiết mỗi test chỉ có đúng một nghiệm và không được dùng cùng một phần tử hai lần.",
    inputFormat: "Dòng đầu gồm hai số nguyên n và target. Dòng thứ hai gồm n số nguyên.",
    outputFormat: "In ra hai chỉ số (đánh số từ 0) cách nhau bởi một khoảng trắng.",
    constraints: ["2 ≤ n ≤ 10⁴", "Mỗi test có đúng một nghiệm"],
    examples: [
      {
        input: "4 9\n2 7 11 15",
        output: "0 1",
        explanation: "nums[0] + nums[1] = 2 + 7 = 9.",
      },
      {
        input: "3 6\n3 2 4",
        output: "1 2",
        explanation: "nums[1] + nums[2] = 2 + 4 = 6.",
      },
    ],
    tests: [
      { stdin: "4 9\n2 7 11 15", expected: "0 1" },
      { stdin: "5 9\n1 2 3 4 5", expected: "3 4" },
      { stdin: "2 100\n40 60", expected: "0 1" },
    ],
    hiddenTests: [
      { stdin: "4 7\n1 2 3 4", expected: "2 3" },
      { stdin: "3 5\n1 2 3", expected: "1 2" },
      { stdin: "4 17\n2 7 11 15", expected: "0 3" },
    ],
  },
  {
    slug: "valid-palindrome",
    title: "Kiểm tra chuỗi đối xứng",
    difficulty: "Dễ",
    topic: "string",
    description:
      "Cho một chuỗi ký tự. Hãy kiểm tra xem chuỗi có đọc xuôi ngược đều giống nhau hay không (chuỗi đối xứng).",
    inputFormat: "Một dòng duy nhất chứa chuỗi cần kiểm tra.",
    outputFormat: 'In ra "true" nếu chuỗi đối xứng, ngược lại in ra "false".',
    constraints: ["Độ dài chuỗi không quá 10⁵ ký tự"],
    examples: [
      {
        input: "radar",
        output: "true",
      },
      {
        input: "hello",
        output: "false",
      },
    ],
    tests: [
      { stdin: "radar", expected: "true" },
      { stdin: "hello", expected: "false" },
      { stdin: "madam", expected: "true" },
      { stdin: "a", expected: "true" },
    ],
    hiddenTests: [
      { stdin: "racecar", expected: "true" },
      { stdin: "abccaa", expected: "false" },
      { stdin: "abba", expected: "true" },
    ],
  },
  {
    slug: "first-unique-char",
    title: "Ký tự đầu tiên không lặp",
    difficulty: "Dễ",
    topic: "hashing",
    description:
      "Cho một chuỗi chỉ gồm chữ cái thường. Hãy tìm ký tự đầu tiên trong chuỗi mà chỉ xuất hiện đúng một lần. Nếu không có ký tự nào như vậy, in ra -1.",
    inputFormat: "Một dòng duy nhất chứa chuỗi cần xử lý.",
    outputFormat: "In ra ký tự thỏa mãn, hoặc -1 nếu không tồn tại.",
    constraints: ["Độ dài chuỗi không quá 10⁵ ký tự"],
    examples: [
      {
        input: "leetcode",
        output: "l",
        explanation: 'Ký tự "l" xuất hiện đầu tiên và chỉ xuất hiện một lần.',
      },
      {
        input: "aabb",
        output: "-1",
      },
    ],
    tests: [
      { stdin: "leetcode", expected: "l" },
      { stdin: "aabb", expected: "-1" },
      { stdin: "adcacedd", expected: "e" },
    ],
    hiddenTests: [
      { stdin: "aadadaad", expected: "-1" },
      { stdin: "swiss", expected: "w" },
      { stdin: "aabbcdd", expected: "c" },
    ],
  },
  {
    slug: "valid-parentheses",
    title: "Ngoặc hợp lệ",
    difficulty: "Dễ",
    topic: "stack-queue",
    description:
      "Cho một chuỗi chỉ gồm các ký tự ngoặc tròn (), ngoặc vuông [] và ngoặc nhọn {}. Hãy kiểm tra xem chuỗi ngoặc có hợp lệ hay không: mỗi ngoặc mở phải được đóng bởi đúng loại ngoặc đóng tương ứng và đúng thứ tự.",
    inputFormat: "Một dòng duy nhất chứa chuỗi ngoặc cần kiểm tra.",
    outputFormat: 'In ra "true" nếu hợp lệ, ngược lại in ra "false".',
    constraints: ["Độ dài chuỗi không quá 10⁴ ký tự"],
    examples: [
      {
        input: "()[]{}",
        output: "true",
      },
      {
        input: "(]",
        output: "false",
      },
    ],
    tests: [
      { stdin: "()[]{}", expected: "true" },
      { stdin: "(]", expected: "false" },
      { stdin: "([)]", expected: "false" },
      { stdin: "{[]}", expected: "true" },
    ],
    hiddenTests: [
      { stdin: "((()))", expected: "true" },
      { stdin: "(()", expected: "false" },
      { stdin: "}{", expected: "false" },
    ],
  },
  {
    slug: "binary-search",
    title: "Tìm kiếm nhị phân",
    difficulty: "Dễ",
    topic: "sorting-searching",
    description:
      "Cho một mảng đã sắp xếp tăng dần gồm n số nguyên và một số mục tiêu target. Hãy tìm chỉ số của target trong mảng bằng thuật toán tìm kiếm nhị phân. Yêu cầu độ phức tạp O(log n).",
    inputFormat:
      "Dòng đầu gồm hai số nguyên n và target. Dòng thứ hai gồm n số nguyên đã sắp xếp tăng dần.",
    outputFormat: "In ra chỉ số (đánh số từ 0) của target, hoặc -1 nếu không tồn tại.",
    constraints: ["1 ≤ n ≤ 10⁵", "Mảng đã sắp xếp tăng dần"],
    examples: [
      {
        input: "5 3\n1 2 3 4 5",
        output: "2",
      },
      {
        input: "5 6\n1 2 3 4 5",
        output: "-1",
      },
    ],
    tests: [
      { stdin: "5 3\n1 2 3 4 5", expected: "2" },
      { stdin: "5 6\n1 2 3 4 5", expected: "-1" },
      { stdin: "1 7\n7", expected: "0" },
    ],
    hiddenTests: [
      { stdin: "6 4\n1 2 3 4 5 6", expected: "3" },
      { stdin: "4 10\n1 3 5 7", expected: "-1" },
      { stdin: "5 1\n1 2 3 4 5", expected: "0" },
    ],
  },
  {
    slug: "climbing-stairs",
    title: "Leo cầu thang",
    difficulty: "Dễ",
    topic: "dp",
    description:
      "Bạn đang leo một cầu thang có n bậc. Mỗi lần bạn có thể bước 1 hoặc 2 bậc. Hỏi có bao nhiêu cách khác nhau để leo lên tới đỉnh?",
    inputFormat: "Một dòng duy nhất chứa số nguyên n.",
    outputFormat: "In ra số cách leo lên đỉnh.",
    constraints: ["1 ≤ n ≤ 45"],
    examples: [
      {
        input: "2",
        output: "2",
        explanation: "Hai cách: (1+1) và (2).",
      },
      {
        input: "3",
        output: "3",
        explanation: "Ba cách: (1+1+1), (1+2) và (2+1).",
      },
    ],
    tests: [
      { stdin: "2", expected: "2" },
      { stdin: "3", expected: "3" },
      { stdin: "5", expected: "8" },
      { stdin: "10", expected: "89" },
    ],
    hiddenTests: [
      { stdin: "1", expected: "1" },
      { stdin: "4", expected: "5" },
      { stdin: "20", expected: "10946" },
    ],
  },
  {
    slug: "remove-duplicates",
    title: "Xóa phần tử trùng trong dãy đã sắp xếp",
    difficulty: "Dễ",
    topic: "linked-list",
    description:
      "Cho một dãy số đã sắp xếp tăng dần (tương tự danh sách liên kết đã sắp xếp). Hãy xóa các phần tử trùng lặp sao cho mỗi giá trị chỉ xuất hiện đúng một lần, giữ nguyên thứ tự.",
    inputFormat:
      "Dòng đầu chứa số nguyên n. Dòng thứ hai chứa n số nguyên đã sắp xếp tăng dần.",
    outputFormat: "In ra dãy sau khi xóa trùng, các số cách nhau bởi khoảng trắng.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [
      {
        input: "5\n1 1 2 3 3",
        output: "1 2 3",
      },
      {
        input: "4\n2 2 2 2",
        output: "2",
      },
    ],
    tests: [
      { stdin: "5\n1 1 2 3 3", expected: "1 2 3" },
      { stdin: "4\n2 2 2 2", expected: "2" },
      { stdin: "3\n1 2 3", expected: "1 2 3" },
    ],
    hiddenTests: [
      { stdin: "6\n1 2 2 3 3 3", expected: "1 2 3" },
      { stdin: "1\n5", expected: "5" },
      { stdin: "5\n-3 -3 -1 0 0", expected: "-3 -1 0" },
    ],
  },
  {
    slug: "kth-largest",
    title: "Phần tử lớn thứ k",
    difficulty: "Trung bình",
    topic: "sorting-searching",
    description:
      "Cho một mảng gồm n số nguyên và số nguyên k. Hãy tìm phần tử lớn thứ k trong mảng (k = 1 nghĩa là phần tử lớn nhất).",
    inputFormat:
      "Dòng đầu gồm hai số nguyên n và k. Dòng thứ hai gồm n số nguyên.",
    outputFormat: "In ra phần tử lớn thứ k.",
    constraints: ["1 ≤ k ≤ n ≤ 10⁵"],
    examples: [
      {
        input: "5 2\n1 5 3 4 2",
        output: "4",
      },
      {
        input: "4 1\n9 3 7 1",
        output: "9",
      },
    ],
    tests: [
      { stdin: "5 2\n1 5 3 4 2", expected: "4" },
      { stdin: "4 1\n9 3 7 1", expected: "9" },
      { stdin: "6 6\n5 4 3 2 1 0", expected: "0" },
    ],
    hiddenTests: [
      { stdin: "5 3\n5 4 3 2 1", expected: "3" },
      { stdin: "3 2\n7 7 7", expected: "7" },
      { stdin: "7 4\n-1 -5 0 3 2 8 6", expected: "2" },
    ],
  },
  {
    slug: "merge-intervals",
    title: "Gộp các khoảng",
    difficulty: "Trung bình",
    topic: "array",
    description:
      "Cho n khoảng đóng [l, r] đã được sắp xếp tăng dần theo đầu mút trái. Hãy gộp các khoảng giao nhau (kể cả chạm nhau ở đầu mút) và in ra các khoảng sau khi gộp.",
    inputFormat:
      "Dòng đầu chứa số nguyên n. n dòng tiếp theo, mỗi dòng chứa hai số nguyên l và r.",
    outputFormat: "Mỗi dòng in một khoảng sau gộp theo định dạng l r.",
    constraints: ["1 ≤ n ≤ 10⁴", "Các khoảng đã sắp xếp theo l tăng dần"],
    examples: [
      {
        input: "3\n1 3\n2 6\n8 10",
        output: "1 6\n8 10",
        explanation: "[1,3] và [2,6] giao nhau nên gộp thành [1,6].",
      },
      {
        input: "2\n1 4\n4 5",
        output: "1 5",
      },
    ],
    tests: [
      { stdin: "3\n1 3\n2 6\n8 10", expected: "1 6\n8 10" },
      { stdin: "2\n1 4\n4 5", expected: "1 5" },
      { stdin: "3\n1 2\n3 4\n5 6", expected: "1 2\n3 4\n5 6" },
    ],
    hiddenTests: [
      { stdin: "4\n1 2\n2 3\n3 4\n5 6", expected: "1 4\n5 6" },
      { stdin: "1\n5 10", expected: "5 10" },
      { stdin: "5\n1 10\n2 3\n4 5\n6 7\n8 9", expected: "1 10" },
    ],
  },
  {
    slug: "number-of-islands",
    title: "Đếm số đảo",
    difficulty: "Trung bình",
    topic: "tree-graph",
    description:
      "Cho một bản đồ lưới r hàng c cột, mỗi ô là '1' (đất) hoặc '0' (nước). Một hòn đảo được tạo bởi các ô đất kề nhau theo 4 hướng (trên, dưới, trái, phải). Hãy đếm số hòn đảo trên bản đồ.",
    inputFormat:
      "Dòng đầu gồm hai số nguyên r và c. r dòng tiếp theo, mỗi dòng là một chuỗi c ký tự '0' hoặc '1' (không có khoảng trắng).",
    outputFormat: "In ra số hòn đảo.",
    constraints: ["1 ≤ r, c ≤ 100"],
    examples: [
      {
        input: "4 5\n11110\n11010\n11000\n00000",
        output: "1",
      },
      {
        input: "4 5\n11000\n11000\n00100\n00011",
        output: "3",
      },
    ],
    tests: [
      { stdin: "4 5\n11110\n11010\n11000\n00000", expected: "1" },
      { stdin: "4 5\n11000\n11000\n00100\n00011", expected: "3" },
      { stdin: "1 1\n0", expected: "0" },
    ],
    hiddenTests: [
      { stdin: "3 3\n111\n101\n111", expected: "1" },
      { stdin: "3 3\n101\n010\n101", expected: "5" },
      { stdin: "2 3\n111\n111", expected: "1" },
    ],
  },
];

export function getProblem(slug: string): Problem | undefined {
  return problems.find((problem) => problem.slug === slug);
}

export function getProblemsByTopic(topic: string): Problem[] {
  return problems.filter((problem) => problem.topic === topic);
}
