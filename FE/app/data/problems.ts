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
      { stdin: "2 5\n2 3", expected: "0 1" },
      { stdin: "2 100\n30 70", expected: "0 1" },
      { stdin: "2 7\n3 4", expected: "0 1" },
      { stdin: "2 9\n4 5", expected: "0 1" },
      { stdin: "2 15\n7 8", expected: "0 1" },
      { stdin: "2 20\n10 10", expected: "0 1" },
      { stdin: "2 11\n5 6", expected: "0 1" },
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
      { stdin: "level", expected: "true" },
      { stdin: "world", expected: "false" },
      { stdin: "noon", expected: "true" },
      { stdin: "civic", expected: "true" },
      { stdin: "abca", expected: "false" },
      { stdin: "deed", expected: "true" },
      { stdin: "test", expected: "false" },
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
      { stdin: "loveleetcode", expected: "v" },
      { stdin: "aabbcc", expected: "-1" },
      { stdin: "abcde", expected: "a" },
      { stdin: "aabbccd", expected: "d" },
      { stdin: "abcabc", expected: "-1" },
      { stdin: "z", expected: "z" },
      { stdin: "abccba", expected: "-1" },
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
      { stdin: "()", expected: "true" },
      { stdin: "(())", expected: "true" },
      { stdin: "([{}])", expected: "true" },
      { stdin: "(", expected: "false" },
      { stdin: ")", expected: "false" },
      { stdin: "{[()]}", expected: "true" },
      { stdin: "(()())", expected: "true" },
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
      { stdin: "3 2\n1 2 3", expected: "1" },
      { stdin: "1 1\n1", expected: "0" },
      { stdin: "5 5\n1 2 3 4 5", expected: "4" },
      { stdin: "4 2\n2 4 6 8", expected: "0" },
      { stdin: "4 8\n2 4 6 8", expected: "3" },
      { stdin: "6 7\n1 3 5 7 9 11", expected: "3" },
      { stdin: "3 5\n1 2 3", expected: "-1" },
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
      { stdin: "6", expected: "13" },
      { stdin: "7", expected: "21" },
      { stdin: "8", expected: "34" },
      { stdin: "9", expected: "55" },
      { stdin: "15", expected: "987" },
      { stdin: "30", expected: "1346269" },
      { stdin: "45", expected: "1836311903" },
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
      { stdin: "3\n1 1 1", expected: "1" },
      { stdin: "4\n1 2 3 4", expected: "1 2 3 4" },
      { stdin: "2\n0 0", expected: "0" },
      { stdin: "4\n-2 -2 0 1", expected: "-2 0 1" },
      { stdin: "7\n1 1 1 2 2 3 3", expected: "1 2 3" },
      { stdin: "5\n2 2 2 2 2", expected: "2" },
      { stdin: "6\n1 1 2 2 3 3", expected: "1 2 3" },
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
      { stdin: "5 1\n1 2 3 4 5", expected: "5" },
      { stdin: "5 5\n1 2 3 4 5", expected: "1" },
      { stdin: "4 2\n4 1 3 2", expected: "3" },
      { stdin: "6 3\n6 5 4 3 2 1", expected: "4" },
      { stdin: "2 2\n2 1", expected: "1" },
      { stdin: "4 4\n1 1 1 1", expected: "1" },
      { stdin: "3 1\n3 1 2", expected: "3" },
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
      { stdin: "2\n1 2\n3 4", expected: "1 2\n3 4" },
      { stdin: "3\n1 5\n2 3\n3 4", expected: "1 5" },
      { stdin: "2\n1 10\n10 20", expected: "1 20" },
      { stdin: "3\n1 2\n2 3\n3 4", expected: "1 4" },
      { stdin: "2\n5 5\n5 5", expected: "5 5" },
      { stdin: "4\n1 3\n2 4\n5 7\n8 9", expected: "1 4\n5 7\n8 9" },
      { stdin: "1\n0 0", expected: "0 0" },
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
      { stdin: "1 1\n1", expected: "1" },
      { stdin: "1 2\n10", expected: "1" },
      { stdin: "2 2\n11\n11", expected: "1" },
      { stdin: "3 3\n000\n000\n000", expected: "0" },
      { stdin: "2 2\n10\n01", expected: "2" },
      { stdin: "4 4\n1100\n1100\n0011\n0011", expected: "2" },
      { stdin: "3 4\n1111\n0000\n1111", expected: "2" },
    ],
  },
  {
    slug: "sum-array",
    title: "Tổng các phần tử",
    difficulty: "Dễ",
    topic: "array",
    description: "Cho mảng n số, tính tổng tất cả phần tử.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In tổng.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"3\n1 2 3","output":"6"}],
    tests: [{"stdin":"3\n1 2 3","expected":"6"},{"stdin":"4\n5 -2 3 1","expected":"7"},{"stdin":"1\n10","expected":"10"}],
    hiddenTests: [{"stdin":"3\n1 3 5","expected":"9"},{"stdin":"3\n3 5 7","expected":"15"},{"stdin":"3\n5 7 9","expected":"21"},{"stdin":"3\n7 9 11","expected":"27"},{"stdin":"3\n9 11 13","expected":"33"},{"stdin":"3\n11 13 15","expected":"39"},{"stdin":"3\n13 15 17","expected":"45"},{"stdin":"3\n15 17 19","expected":"51"},{"stdin":"3\n17 19 21","expected":"57"},{"stdin":"3\n19 21 23","expected":"63"}],
  },
  {
    slug: "find-max",
    title: "Giá trị lớn nhất",
    difficulty: "Dễ",
    topic: "array",
    description: "Tìm max trong mảng.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In max.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"3\n1 5 2","output":"5"}],
    tests: [{"stdin":"3\n1 5 2","expected":"5"},{"stdin":"4\n-1 -5 0 -3","expected":"0"},{"stdin":"1\n7","expected":"7"}],
    hiddenTests: [{"stdin":"4\n-5 2 10 0","expected":"10"},{"stdin":"4\n-4 3 9 0","expected":"9"},{"stdin":"4\n-3 4 8 0","expected":"8"},{"stdin":"4\n-2 5 7 0","expected":"7"},{"stdin":"4\n-1 6 6 0","expected":"6"},{"stdin":"4\n0 7 5 0","expected":"7"},{"stdin":"4\n1 8 4 0","expected":"8"},{"stdin":"4\n2 9 3 0","expected":"9"},{"stdin":"4\n3 10 2 0","expected":"10"},{"stdin":"4\n4 11 1 0","expected":"11"}],
  },
  {
    slug: "reverse-array",
    title: "Đảo ngược mảng",
    difficulty: "Dễ",
    topic: "array",
    description: "Đảo ngược thứ tự mảng.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In mảng đảo ngược.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"3\n1 2 3","output":"3 2 1"}],
    tests: [{"stdin":"3\n1 2 3","expected":"3 2 1"},{"stdin":"4\n4 3 2 1","expected":"1 2 3 4"},{"stdin":"1\n5","expected":"5"}],
    hiddenTests: [{"stdin":"3\n1 2 3","expected":"3 2 1"},{"stdin":"4\n2 3 4 5","expected":"5 4 3 2"},{"stdin":"5\n3 4 5 6 7","expected":"7 6 5 4 3"},{"stdin":"3\n4 5 6","expected":"6 5 4"},{"stdin":"4\n5 6 7 8","expected":"8 7 6 5"},{"stdin":"5\n6 7 8 9 10","expected":"10 9 8 7 6"},{"stdin":"3\n7 8 9","expected":"9 8 7"},{"stdin":"4\n8 9 10 11","expected":"11 10 9 8"},{"stdin":"5\n9 10 11 12 13","expected":"13 12 11 10 9"},{"stdin":"3\n10 11 12","expected":"12 11 10"}],
  },
  {
    slug: "count-vowels",
    title: "Đếm nguyên âm",
    difficulty: "Dễ",
    topic: "string",
    description: "Đếm số nguyên âm a,e,i,o,u trong chuỗi thường.",
    inputFormat: "Một dòng chuỗi.",
    outputFormat: "In số lượng.",
    constraints: ["Độ dài ≤ 10⁵"],
    examples: [{"input":"hello","output":"2"}],
    tests: [{"stdin":"hello","expected":"2"},{"stdin":"aeiou","expected":"5"},{"stdin":"bcdfg","expected":"0"}],
    hiddenTests: [{"stdin":"world","expected":"1"},{"stdin":"education","expected":"5"},{"stdin":"rhythm","expected":"0"},{"stdin":"queue","expected":"4"},{"stdin":"beautiful","expected":"5"},{"stdin":"aeiouaeiou","expected":"10"},{"stdin":"xyz","expected":"0"},{"stdin":"hello world","expected":"3"},{"stdin":"programming","expected":"3"},{"stdin":"aei","expected":"3"}],
  },
  {
    slug: "count-even",
    title: "Đếm số chẵn",
    difficulty: "Dễ",
    topic: "array",
    description: "Đếm số phần tử chẵn trong mảng.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In số lượng.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"4\n1 2 3 4","output":"2"}],
    tests: [{"stdin":"4\n1 2 3 4","expected":"2"},{"stdin":"3\n2 4 6","expected":"3"},{"stdin":"3\n1 3 5","expected":"0"}],
    hiddenTests: [{"stdin":"4\n0 1 2 3","expected":"2"},{"stdin":"4\n1 2 3 4","expected":"2"},{"stdin":"4\n2 3 4 5","expected":"2"},{"stdin":"4\n3 4 5 6","expected":"2"},{"stdin":"4\n4 5 6 7","expected":"2"},{"stdin":"4\n5 6 7 8","expected":"2"},{"stdin":"4\n6 7 8 9","expected":"2"},{"stdin":"4\n7 8 9 10","expected":"2"},{"stdin":"4\n8 9 10 11","expected":"2"},{"stdin":"4\n9 10 11 12","expected":"2"}],
  },
  {
    slug: "sort-array",
    title: "Sắp xếp mảng",
    difficulty: "Dễ",
    topic: "sorting-searching",
    description: "Sắp xếp mảng tăng dần.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In mảng đã sắp xếp.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"3\n3 1 2","output":"1 2 3"}],
    tests: [{"stdin":"3\n3 1 2","expected":"1 2 3"},{"stdin":"4\n5 4 3 2","expected":"2 3 4 5"},{"stdin":"1\n9","expected":"9"}],
    hiddenTests: [{"stdin":"3\n3 1 2","expected":"1 2 3"},{"stdin":"3\n4 1 2","expected":"1 2 4"},{"stdin":"3\n5 1 2","expected":"1 2 5"},{"stdin":"3\n6 1 2","expected":"1 2 6"},{"stdin":"3\n7 1 2","expected":"1 2 7"},{"stdin":"3\n8 1 2","expected":"1 2 8"},{"stdin":"3\n9 1 2","expected":"1 2 9"},{"stdin":"3\n10 1 2","expected":"1 2 10"},{"stdin":"3\n11 1 2","expected":"1 2 11"},{"stdin":"3\n12 1 2","expected":"1 2 12"}],
  },
  {
    slug: "factorial",
    title: "Giai thừa",
    difficulty: "Dễ",
    topic: "dp",
    description: "Tính n! với 0 ≤ n ≤ 10.",
    inputFormat: "Một dòng n.",
    outputFormat: "In n!.",
    constraints: ["0 ≤ n ≤ 10"],
    examples: [{"input":"5","output":"120"}],
    tests: [{"stdin":"0","expected":"1"},{"stdin":"5","expected":"120"},{"stdin":"3","expected":"6"}],
    hiddenTests: [{"stdin":"0","expected":"1"},{"stdin":"1","expected":"1"},{"stdin":"2","expected":"2"},{"stdin":"3","expected":"6"},{"stdin":"4","expected":"24"},{"stdin":"5","expected":"120"},{"stdin":"6","expected":"720"},{"stdin":"7","expected":"5040"},{"stdin":"8","expected":"40320"},{"stdin":"9","expected":"362880"}],
  },
  {
    slug: "reverse-string",
    title: "Đảo chuỗi",
    difficulty: "Dễ",
    topic: "stack-queue",
    description: "Đảo ngược chuỗi.",
    inputFormat: "Một dòng chuỗi.",
    outputFormat: "In chuỗi đảo ngược.",
    constraints: ["Độ dài ≤ 10⁴"],
    examples: [{"input":"abc","output":"cba"}],
    tests: [{"stdin":"abc","expected":"cba"},{"stdin":"hello","expected":"olleh"},{"stdin":"a","expected":"a"}],
    hiddenTests: [{"stdin":"abc","expected":"cba"},{"stdin":"hello","expected":"olleh"},{"stdin":"abcd","expected":"dcba"},{"stdin":"12345","expected":"54321"},{"stdin":"a","expected":"a"},{"stdin":"ab","expected":"ba"},{"stdin":"xyz","expected":"zyx"},{"stdin":"hello world","expected":"dlrow olleh"},{"stdin":"GoCode","expected":"edoCoG"},{"stdin":"level","expected":"level"}],
  },
  {
    slug: "missing-number",
    title: "Số thiếu",
    difficulty: "Trung bình",
    topic: "hashing",
    description: "Cho mảng chứa n số phân biệt từ 0..n, tìm số thiếu.",
    inputFormat: "Dòng đầu n, dòng 2 gồm n số.",
    outputFormat: "In số thiếu.",
    constraints: ["1 ≤ n ≤ 10⁴"],
    examples: [{"input":"3\n3 0 1","output":"2"}],
    tests: [{"stdin":"3\n3 0 1","expected":"2"},{"stdin":"2\n0 1","expected":"2"},{"stdin":"2\n1 0","expected":"2"}],
    hiddenTests: [{"stdin":"3\n0 1 2","expected":"3"},{"stdin":"4\n4 0 3 1","expected":"2"},{"stdin":"1\n0","expected":"1"},{"stdin":"1\n1","expected":"0"},{"stdin":"5\n5 4 3 2 0","expected":"1"},{"stdin":"4\n2 3 0 1","expected":"4"},{"stdin":"2\n1 2","expected":"0"},{"stdin":"3\n2 0 3","expected":"1"},{"stdin":"5\n0 1 2 3 5","expected":"4"},{"stdin":"6\n6 0 1 2 4 3","expected":"5"}],
  },
  {
    slug: "check-anagram",
    title: "Kiểm tra anagram",
    difficulty: "Trung bình",
    topic: "string",
    description: "Kiểm tra hai chuỗi có phải anagram nhau không.",
    inputFormat: "Hai dòng mỗi dòng một chuỗi.",
    outputFormat: "In true/false.",
    constraints: ["Độ dài ≤ 10⁵"],
    examples: [{"input":"anagram\nnagaram","output":"true"}],
    tests: [{"stdin":"anagram\nnagaram","expected":"true"},{"stdin":"rat\ncar","expected":"false"},{"stdin":"a\nab","expected":"false"}],
    hiddenTests: [{"stdin":"listen\nsilent","expected":"true"},{"stdin":"hello\nbello","expected":"false"},{"stdin":"abc\ncba","expected":"true"},{"stdin":"aab\naba","expected":"true"},{"stdin":"abc\ndef","expected":"false"},{"stdin":"a\n a","expected":"false"},{"stdin":"ab\nba","expected":"true"},{"stdin":"abcd\nabce","expected":"false"},{"stdin":"\n\n","expected":"true"},{"stdin":"a\n a","expected":"false"}],
  },
];

export function getProblemsByTopic(topic: string): Problem[] {
  return problems.filter((problem) => problem.topic === topic);
}
