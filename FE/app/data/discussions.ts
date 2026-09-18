export type DiscussionReply = {
  author: string;
  timeAgo: string;
  content: string;
};

export type Discussion = {
  id: string;
  title: string;
  author: string;
  timeAgo: string;
  category: "Thuật toán" | "Phỏng vấn" | "GoCode" | "Góc newbie";
  replies: number;
  views: number;
  excerpt: string;
  topReplies: DiscussionReply[];
};

export const DISCUSSION_CATEGORIES = [
  "Tất cả",
  "Thuật toán",
  "Phỏng vấn",
  "GoCode",
  "Góc newbie",
] as const;

export const discussions: Discussion[] = [
  {
    id: "two-sum-toi-uu",
    title: "Two Sum O(n²) bị TLE, tối ưu bằng hash map thế nào?",
    author: "minh.anh",
    timeAgo: "2 giờ trước",
    category: "Thuật toán",
    replies: 14,
    views: 326,
    excerpt:
      "Mình giải Two Sum bằng 2 vòng lặp lồng nhau thì bị quá thời gian với n = 10⁴. Nghe nói dùng hash map còn O(n) nhưng chưa hình dung cách lưu chỉ số. Ai gợi ý hướng đi với?",
    topReplies: [
      {
        author: "thay_giao_code",
        timeAgo: "1 giờ trước",
        content:
          "Duyệt mảng một lần, với mỗi x tính need = target - x rồi tra need trong map. Nếu có thì xong, chưa có thì lưu x cùng chỉ số của nó. Mỗi phần tử chỉ đi qua đúng một lần nên O(n).",
      },
      {
        author: "minh.anh",
        timeAgo: "45 phút trước",
        content:
          "À hiểu rồi, chìa khóa là tra cứu trước rồi mới lưu, để không dùng trùng một phần tử. Cảm ơn nhiều!",
      },
    ],
  },
  {
    id: "hoc-dp-tu-dau",
    title: "Mất gốc quy hoạch động, nên bắt đầu từ bài nào?",
    author: "newbie_2026",
    timeAgo: "5 giờ trước",
    category: "Góc newbie",
    replies: 22,
    views: 512,
    excerpt:
      "Nhìn công thức truy hồi là mình choáng. Mọi người học DP theo thứ tự nào: Fibonacci → Climbing Stairs → Knapsack có ổn không? Xin lộ trình cụ thể.",
    topReplies: [
      {
        author: "dp_master",
        timeAgo: "4 giờ trước",
        content:
          "Thứ tự đó chuẩn đấy. Quy tắc của mình: bài nào cũng viết đệ quy + memo trước, chạy đúng rồi mới ép thành bảng bottom-up. Đừng học thuộc công thức, hãy tự suy ra từ bài toán con.",
      },
      {
        author: "lan.phuong",
        timeAgo: "3 giờ trước",
        content:
          "Bổ sung: sau Climbing Stairs thì làm House Robber rồi mới sang Knapsack. Mỗi bài tự vẽ cây đệ quy ra giấy một lần là nhớ lâu.",
      },
    ],
  },
  {
    id: "big-o-phong-van",
    title: "Phỏng vấn hỏi Big-O thì trả lời sâu đến mức nào?",
    author: "junior.dev",
    timeAgo: "1 ngày trước",
    category: "Phỏng vấn",
    replies: 9,
    views: 287,
    excerpt:
      "Mình giải được bài nhưng khi interviewer hỏi độ phức tạp thì lúng túng, nhất là phân biệt O(n log n) với O(n). Có mẹo nào trình bày gọn mà vẫn thuyết phục không?",
    topReplies: [
      {
        author: "senior_go",
        timeAgo: "20 giờ trước",
        content:
          "Công thức 3 câu: (1) vòng lặp ngoài chạy n lần, (2) công việc trong mỗi lần là gì, (3) cộng/nhân lại ra bao nhiêu + bộ nhớ phụ dùng thêm. Nói được 3 câu này là đủ điểm.",
      },
    ],
  },
  {
    id: "stl-cpp-co-nen",
    title: "Có nên dùng bits/stdc++.h và STL khi luyện không?",
    author: "cpp_fan",
    timeAgo: "2 ngày trước",
    category: "Thuật toán",
    replies: 17,
    views: 431,
    excerpt:
      "Dùng vector/map/set của STL thì giải nhanh, nhưng sợ lệ thuộc rồi không hiểu bản chất cấu trúc dữ liệu. Mọi người cân bằng hai cái này thế nào?",
    topReplies: [
      {
        author: "thay_giao_code",
        timeAgo: "1 ngày trước",
        content:
          "Luật của mình: lần đầu gặp cấu trúc nào thì tự cài tay một lần (linked list, heap, hash table), từ lần sau dùng STL thoải mái để tập trung vào thuật toán.",
      },
      {
        author: "cpp_fan",
        timeAgo: "1 ngày trước",
        content:
          "Hợp lý. Mình sẽ tự cài heap một lần rồi mới dùng priority_queue.",
      },
    ],
  },
  {
    id: "streak-30-ngay",
    title: "Chia sẻ: 30 ngày streak và những gì mình rút ra",
    author: "lan.phuong",
    timeAgo: "3 ngày trước",
    category: "GoCode",
    replies: 31,
    views: 890,
    excerpt:
      "Mỗi ngày 1 bài Dễ + cuối tuần 1 bài Trung bình, đúng 30 ngày không nghỉ. Kết quả: tốc độ đọc đề nhanh gấp đôi, nhưng DP vẫn là ác mộng. Chia sẻ routine chi tiết trong bài.",
    topReplies: [
      {
        author: "newbie_2026",
        timeAgo: "2 ngày trước",
        content:
          "Xin vía! Mình mới ngày thứ 4. Bạn xử lý mấy hôm nản không muốn mở máy thế nào?",
      },
      {
        author: "lan.phuong",
        timeAgo: "2 ngày trước",
        content:
          "Quy tắc 10 phút: mở máy làm 10 phút, nản thì nghỉ mà không áy náy. 90% số hôm là làm tiếp luôn sau 10 phút đó.",
      },
    ],
  },
  {
    id: "binary-search-bien-the",
    title: "Tổng hợp các biến thể binary search hay gặp",
    author: "dp_master",
    timeAgo: "4 ngày trước",
    category: "Thuật toán",
    replies: 11,
    views: 356,
    excerpt:
      "Tìm phần tử đầu/cuối bằng target, tìm trong mảng xoay, tìm peak, tìm căn bậc hai nguyên... Mình gom công thức chung lower_bound/upper_bound và ví dụ cho từng dạng.",
    topReplies: [
      {
        author: "junior.dev",
        timeAgo: "3 ngày trước",
        content:
          "Bài mảng xoay lừa mình 3 lần rồi. Mẹo xác định nửa nào đã sắp xếp của bạn cứu mình một bàn thua.",
      },
    ],
  },
  {
    id: "goi-y-lo-trinh-sinh-vien",
    title: "Sinh viên năm 2 cần bao nhiêu bài để tự tin intern?",
    author: "sv_nam2",
    timeAgo: "5 ngày trước",
    category: "Phỏng vấn",
    replies: 19,
    views: 623,
    excerpt:
      "Mục tiêu intern backend hè này. Hiện làm được ~40 bài Dễ. Không biết ngưỡng an toàn là bao nhiêu và nên dàn trải chủ đề hay cày sâu 1-2 chủ đề?",
    topReplies: [
      {
        author: "senior_go",
        timeAgo: "4 ngày trước",
        content:
          "Khoảng 100-120 bài là ngưỡng thoải mái: phủ hết array/string/hash/stack/queue + binary search, mỗi chủ đề 10-15 bài. Đừng cày số lượng, mỗi bài phải tự giải thích được Big-O.",
      },
      {
        author: "sv_nam2",
        timeAgo: "4 ngày trước",
        content:
          "Rõ rồi, mình sẽ phủ đều thay vì cày 50 bài array như hiện tại.",
      },
    ],
  },
  {
    id: "de-xuat-bai-moi",
    title: "Đề xuất: thêm bài đồ thị cơ bản cho newbie",
    author: "minh.anh",
    timeAgo: "1 tuần trước",
    category: "GoCode",
    replies: 7,
    views: 198,
    excerpt:
      "Kho bài hiện tại nhảy từ cây sang Number of Islands hơi gắt với người mới. Đề xuất thêm 2-3 bài BFS/DFS trên lưới nhỏ (flood fill, đếm vùng liên thông) làm bàn đạp.",
    topReplies: [
      {
        author: "gocode_team",
        timeAgo: "6 ngày trước",
        content:
          "Ghi nhận! Team đang soạn chùm 3 bài flood fill → đếm thành phần → đường đi ngắn nhất trên lưới, dự kiến lên sóng tuần sau.",
      },
    ],
  },
];
