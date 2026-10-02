import type { SeedPack } from './types';

const MODULES = {
  complexity: 'Độ phức tạp thuật toán',
  binarySearch: 'Tìm kiếm nhị phân',
  sorting: 'Sắp xếp',
  dp: 'Quy hoạch động cơ bản',
  graph: 'Đồ thị và duyệt đồ thị',
  review: 'Ôn tập & Đề tổng hợp',
} as const;

const NB = 'Nhận biết';
const TH = 'Thông hiểu';
const VD = 'Vận dụng';
const VDC = 'Vận dụng cao';

/**
 * Pack Tin học — thuật toán & cấu trúc dữ liệu, dùng cho các khoá VIP / Basic /
 * Advance / Hardcore. 30 câu (25 trắc nghiệm + 5 tự luận) trải 5 chuyên đề.
 */
export const algorithmsPack: SeedPack = {
  key: 'algorithms',
  courseNames: ['VIP', 'Basic', 'Advance', 'Hardcore'],
  difficultyLevels: [NB, TH, VD, VDC],
  modules: [
    MODULES.complexity,
    MODULES.binarySearch,
    MODULES.sorting,
    MODULES.dp,
    MODULES.graph,
    MODULES.review,
  ],
  questions: [
    // ── Độ phức tạp thuật toán ────────────────────────────────────────────
    {
      key: 'cx-01',
      module: MODULES.complexity,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Ký hiệu $O$ lớn (Big-O) dùng để mô tả điều gì của một thuật toán?</p>',
      options: [
        'Cận trên tiệm cận của thời gian chạy khi kích thước dữ liệu tăng',
        'Thời gian chạy chính xác tính bằng giây',
        'Lượng bộ nhớ tối thiểu bắt buộc phải dùng',
        'Số dòng mã nguồn của thuật toán',
      ],
      correctIndex: 0,
      explanation:
        '<p>Big-O mô tả <strong>cận trên tiệm cận</strong>: tốc độ tăng của chi phí khi $n \\to \\infty$, không phụ thuộc máy hay ngôn ngữ.</p>',
    },
    {
      key: 'cx-02',
      module: MODULES.complexity,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Duyệt tuần tự toàn bộ một mảng $n$ phần tử để tìm giá trị lớn nhất có độ phức tạp là:</p>',
      options: ['$O(1)$', '$O(\\log n)$', '$O(n)$', '$O(n^2)$'],
      correctIndex: 2,
      explanation:
        '<p>Mỗi phần tử được chạm đúng một lần nên tổng chi phí tỉ lệ thuận với $n$.</p>',
    },
    {
      key: 'cx-03',
      module: MODULES.complexity,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Đoạn mã sau có độ phức tạp thời gian là bao nhiêu?</p><pre><code>for (int i = 0; i &lt; n; i++)\n  for (int j = i + 1; j &lt; n; j++)\n    if (a[i] + a[j] == x) cnt++;</code></pre>',
      options: ['$O(n)$', '$O(n \\log n)$', '$O(n^2)$', '$O(n^3)$'],
      correctIndex: 2,
      explanation:
        '<p>Số cặp $(i, j)$ với $i &lt; j$ là $\\frac{n(n-1)}{2}$, tức $\\Theta(n^2)$. Hằng số $\\frac{1}{2}$ bị bỏ trong Big-O.</p>',
    },
    {
      key: 'cx-04',
      module: MODULES.complexity,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Vòng lặp <code>while (n &gt; 0) n /= 2;</code> thực hiện bao nhiêu lần lặp theo $n$?</p>',
      options: [
        '$\\Theta(1)$',
        '$\\Theta(\\log n)$',
        '$\\Theta(\\sqrt{n})$',
        '$\\Theta(n)$',
      ],
      correctIndex: 1,
      explanation:
        '<p>Mỗi lần $n$ giảm một nửa, nên sau $k$ bước $n$ còn $n/2^k$. Dừng khi $2^k &gt; n$, tức $k \\approx \\log_2 n$.</p>',
    },
    {
      key: 'cx-05',
      module: MODULES.complexity,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Với $n = 10^5$ và giới hạn khoảng $10^8$ phép tính trong 1 giây, thuật toán nào <em>chắc chắn</em> chạy kịp?</p>',
      options: [
        'Thuật toán $O(n^2)$',
        'Thuật toán $O(n \\log n)$',
        'Thuật toán $O(2^n)$',
        'Thuật toán $O(n!)$',
      ],
      correctIndex: 1,
      explanation:
        '<p>$n \\log_2 n \\approx 10^5 \\times 17 \\approx 1{,}7 \\times 10^6$ phép tính — thoải mái. Trong khi $n^2 = 10^{10}$ vượt xa giới hạn.</p>',
    },
    {
      key: 'cx-06',
      module: MODULES.complexity,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Trình bày thuật toán sàng Eratosthenes tìm mọi số nguyên tố không vượt quá $n$. Giải thích vì sao độ phức tạp của sàng là $O(n \\log \\log n)$ chứ không phải $O(n^2)$.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Mô tả sàng: mảng đánh dấu <code>isPrime[2..n]</code>, với mỗi $p$ nguyên tố đánh dấu bội $p^2, p^2 + p, \\dots \\le n$.</li><li>Chỉ cần duyệt $p \\le \\sqrt{n}$.</li><li>Tổng chi phí $= \\sum_{p \\le n, p \\text{ nguyên tố}} \\frac{n}{p} = n \\sum_{p} \\frac{1}{p}$.</li><li>Dùng kết quả Mertens: $\\sum_{p \\le n} \\frac{1}{p} \\approx \\ln \\ln n$, suy ra $O(n \\log \\log n)$.</li><li>Nêu rõ mỗi hợp số bị đánh dấu vài lần chứ không phải $n$ lần — đó là lý do không ra $O(n^2)$.</li></ul>',
    },

    // ── Tìm kiếm nhị phân ─────────────────────────────────────────────────
    {
      key: 'bs-01',
      module: MODULES.binarySearch,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Điều kiện tiên quyết để áp dụng tìm kiếm nhị phân trên một mảng là gì?</p>',
      options: [
        'Mảng phải đã được sắp xếp theo thứ tự đơn điệu',
        'Mảng phải có số phần tử là luỹ thừa của $2$',
        'Mảng không được chứa phần tử trùng nhau',
        'Mảng phải toàn số nguyên dương',
      ],
      correctIndex: 0,
      explanation:
        '<p>Nhị phân dựa vào tính đơn điệu để loại một nửa miền tìm kiếm sau mỗi bước.</p>',
    },
    {
      key: 'bs-02',
      module: MODULES.binarySearch,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Độ phức tạp thời gian của tìm kiếm nhị phân trên mảng $n$ phần tử là:</p>',
      options: ['$O(1)$', '$O(\\log n)$', '$O(n)$', '$O(n \\log n)$'],
      correctIndex: 1,
      explanation:
        '<p>Miền tìm kiếm giảm một nửa mỗi bước nên số bước tối đa là $\\lceil \\log_2 n \\rceil$.</p>',
    },
    {
      key: 'bs-03',
      module: MODULES.binarySearch,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Tìm kiếm nhị phân trên mảng đã sắp xếp gồm $10^6$ phần tử cần tối đa bao nhiêu lần so sánh?</p>',
      options: ['Khoảng $10$', 'Khoảng $20$', 'Khoảng $1000$', 'Khoảng $10^6$'],
      correctIndex: 1,
      explanation:
        '<p>$\\log_2 10^6 \\approx 19{,}93$, nên tối đa khoảng $20$ bước.</p>',
    },
    {
      key: 'bs-04',
      module: MODULES.binarySearch,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Câu lệnh <code>int mid = (l + r) / 2;</code> có thể sai khi $l, r$ là số nguyên $32$ bit lớn. Cách viết nào khắc phục được?</p>',
      options: [
        '<code>int mid = l + (r - l) / 2;</code>',
        '<code>int mid = (l + r) % 2;</code>',
        '<code>int mid = r / 2 - l;</code>',
        '<code>int mid = (l * r) / 2;</code>',
      ],
      correctIndex: 0,
      explanation:
        '<p>$l + r$ có thể tràn kiểu <code>int</code>. Viết $l + \\frac{r - l}{2}$ cho cùng kết quả nhưng không bao giờ vượt quá $r$.</p>',
    },
    {
      key: 'bs-05',
      module: MODULES.binarySearch,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Cho mảng đã sắp xếp tăng dần $a = [1, 3, 3, 3, 7, 9]$. Kết quả của phép tìm <em>vị trí đầu tiên</em> có giá trị $\\ge 3$ (lower bound) là chỉ số nào, đếm từ $0$?</p>',
      options: ['$0$', '$1$', '$3$', '$4$'],
      correctIndex: 1,
      explanation:
        '<p>Phần tử đầu tiên $\\ge 3$ là $a[1] = 3$. Lower bound luôn trả về vị trí <strong>trái nhất</strong> thoả điều kiện.</p>',
    },
    {
      key: 'bs-06',
      module: MODULES.binarySearch,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Bài toán chặt gỗ: cho $n$ cây gỗ độ dài $h_1, \\dots, h_n$ và một máy cưa đặt ở độ cao $H$; máy cắt phần trên của mọi cây cao hơn $H$, thu về tổng $\\sum_{i} \\max(0, h_i - H)$. Tìm $H$ <strong>lớn nhất</strong> sao cho thu được ít nhất $M$ mét gỗ. Trình bày thuật toán nhị phân trên đáp án và chứng minh tính đúng đắn.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Đặt $f(H) = \\sum_i \\max(0, h_i - H)$; chứng minh $f$ <strong>nghịch biến</strong> theo $H$ (mỗi hạng tử không tăng).</li><li>Tính đơn điệu cho phép nhị phân trên miền đáp án $H \\in [0, \\max h_i]$ thay vì trên mảng.</li><li>Bất biến: giữ đoạn $[lo, hi]$ với $f(lo) \\ge M$; mỗi bước xét $mid$, nếu $f(mid) \\ge M$ thì $lo = mid$, ngược lại $hi = mid - 1$.</li><li>Độ phức tạp $O(n \\log(\\max h_i))$ — mỗi lần kiểm tra $f$ tốn $O(n)$.</li><li>Lưu ý kiểu dữ liệu: tổng có thể vượt <code>int</code>, cần <code>long long</code>.</li></ul>',
    },

    // ── Sắp xếp ───────────────────────────────────────────────────────────
    {
      key: 'st-01',
      module: MODULES.sorting,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Thuật toán sắp xếp nào có độ phức tạp trung bình $O(n \\log n)$?</p>',
      options: ['Bubble Sort', 'Selection Sort', 'Insertion Sort', 'Merge Sort'],
      correctIndex: 3,
      explanation:
        '<p>Merge Sort luôn $\\Theta(n \\log n)$ ở mọi trường hợp. Ba thuật toán còn lại đều $\\Theta(n^2)$ trung bình.</p>',
    },
    {
      key: 'st-02',
      module: MODULES.sorting,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Một thuật toán sắp xếp được gọi là <em>ổn định</em> (stable) khi:</p>',
      options: [
        'Giữ nguyên thứ tự tương đối của các phần tử có khoá bằng nhau',
        'Không dùng thêm bộ nhớ phụ',
        'Luôn chạy đúng $O(n \\log n)$ trong mọi trường hợp',
        'Không dùng đệ quy',
      ],
      correctIndex: 0,
      explanation:
        '<p>Tính ổn định quan trọng khi sắp xếp nhiều khoá liên tiếp: khoá sắp sau không phá thứ tự khoá sắp trước.</p>',
    },
    {
      key: 'st-03',
      module: MODULES.sorting,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Quick Sort rơi vào trường hợp xấu nhất $O(n^2)$ khi nào?</p>',
      options: [
        'Khi pivot luôn chia mảng thành hai nửa bằng nhau',
        'Khi pivot luôn là phần tử nhỏ nhất hoặc lớn nhất của đoạn',
        'Khi mảng có nhiều phần tử trùng nhau và dùng phân hoạch ba đường',
        'Khi mảng có số phần tử lẻ',
      ],
      correctIndex: 1,
      explanation:
        '<p>Pivot cực trị làm một nửa rỗng, độ sâu đệ quy thành $n$ nên tổng chi phí $\\Theta(n^2)$. Chọn pivot ngẫu nhiên giúp tránh trường hợp này.</p>',
    },
    {
      key: 'st-04',
      module: MODULES.sorting,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Merge Sort cần bao nhiêu bộ nhớ phụ khi sắp xếp mảng $n$ phần tử?</p>',
      options: ['$O(1)$', '$O(\\log n)$', '$O(n)$', '$O(n \\log n)$'],
      correctIndex: 2,
      explanation:
        '<p>Bước trộn cần mảng tạm cỡ $n$. Đây là cái giá đổi lấy tính ổn định và $\\Theta(n \\log n)$ ở mọi trường hợp.</p>',
    },
    {
      key: 'st-05',
      module: MODULES.sorting,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Số <em>nghịch thế</em> của dãy $a = [3, 1, 4, 2]$ (số cặp $i &lt; j$ mà $a_i &gt; a_j$) là:</p>',
      options: ['$2$', '$3$', '$4$', '$6$'],
      correctIndex: 1,
      explanation:
        '<p>Các cặp nghịch thế: $(3,1), (3,2), (4,2)$ — tổng cộng $3$. Đếm nghịch thế bằng Merge Sort tốn $O(n \\log n)$.</p>',
    },
    {
      key: 'st-06',
      module: MODULES.sorting,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Radix Sort sắp xếp số nguyên bằng cách sắp lần lượt theo từng chữ số, từ hàng thấp lên hàng cao, mỗi vòng dùng Counting Sort. Giải thích vì sao <strong>tính ổn định</strong> của Counting Sort là điều kiện bắt buộc để Radix Sort cho kết quả đúng.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Sau vòng sắp theo hàng thứ $k$, dãy đã đúng thứ tự theo $k$ chữ số thấp nhất — đây là bất biến quy nạp.</li><li>Ở vòng $k+1$, hai số có chữ số hàng $k+1$ bằng nhau phải giữ nguyên thứ tự đã đạt được từ vòng trước; chỉ thuật toán ổn định mới bảo toàn điều đó.</li><li>Nêu phản ví dụ cụ thể khi dùng thuật toán không ổn định (ví dụ $\\{21, 12\\}$ hoặc tương tự) làm hỏng bất biến.</li><li>Độ phức tạp $O(d \\cdot (n + b))$ với $d$ là số chữ số, $b$ là cơ số.</li></ul>',
    },

    // ── Quy hoạch động cơ bản ─────────────────────────────────────────────
    {
      key: 'dp-01',
      module: MODULES.dp,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Hai tính chất bắt buộc để một bài toán giải được bằng quy hoạch động là:</p>',
      options: [
        'Cấu trúc con tối ưu và các bài toán con gối nhau',
        'Dữ liệu đã sắp xếp và không có phần tử âm',
        'Có thể chia đôi và trộn lại',
        'Có thể mô hình bằng đồ thị vô hướng',
      ],
      correctIndex: 0,
      explanation:
        '<p>Không có cấu trúc con tối ưu thì công thức truy hồi sai; không có bài toán con gối nhau thì chia để trị đã đủ, ghi nhớ trạng thái không lợi gì.</p>',
    },
    {
      key: 'dp-02',
      module: MODULES.dp,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Công thức truy hồi của dãy Fibonacci với $n \\ge 2$ là:</p>',
      options: [
        '$f(n) = f(n-1) + f(n-2)$',
        '$f(n) = f(n-1) \\times f(n-2)$',
        '$f(n) = 2 f(n-1)$',
        '$f(n) = f(n/2) + 1$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Cài bằng quy hoạch động từ dưới lên cho $O(n)$, thay vì đệ quy trần $O(\\varphi^n)$.</p>',
    },
    {
      key: 'dp-03',
      module: MODULES.dp,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Bài toán cái túi 0/1 với $n$ vật, mỗi vật có khối lượng $w_i$ và giá trị $v_i$, sức chứa $W$. Gọi $f(i, j)$ là giá trị lớn nhất khi xét $i$ vật đầu với sức chứa $j$. Công thức đúng là:</p>',
      options: [
        '$f(i, j) = f(i-1, j) + v_i$',
        '$f(i, j) = \\max\\big(f(i-1, j),\\ f(i-1, j-w_i) + v_i\\big)$ khi $j \\ge w_i$',
        '$f(i, j) = \\min\\big(f(i-1, j),\\ f(i-1, j-w_i)\\big)$',
        '$f(i, j) = f(i-1, j-1) + v_i$',
      ],
      correctIndex: 1,
      explanation:
        '<p>Mỗi vật chỉ có hai lựa chọn: bỏ qua ($f(i-1, j)$) hoặc lấy ($f(i-1, j-w_i) + v_i$). Độ phức tạp $O(nW)$.</p>',
    },
    {
      key: 'dp-04',
      module: MODULES.dp,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Độ dài dãy con tăng dài nhất (LIS) của dãy $a = [3, 1, 4, 1, 5, 9, 2, 6]$ là:</p>',
      options: ['$3$', '$4$', '$5$', '$6$'],
      correctIndex: 1,
      explanation:
        '<p>Một dãy con tăng dài nhất là $1, 4, 5, 9$ hoặc $1, 4, 5, 6$ — độ dài $4$.</p>',
    },
    {
      key: 'dp-05',
      module: MODULES.dp,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Bài toán đổi tiền với các mệnh giá $\\{1, 3, 4\\}$: số đồng xu ít nhất để đổi đúng $6$ đơn vị là:</p>',
      options: ['$2$', '$3$', '$4$', '$6$'],
      correctIndex: 0,
      explanation:
        '<p>$6 = 3 + 3$ dùng $2$ đồng. Lưu ý thuật toán tham lam chọn $4 + 1 + 1 = 3$ đồng sẽ <strong>sai</strong> — đây là lý do phải dùng quy hoạch động.</p>',
    },
    {
      key: 'dp-06',
      module: MODULES.dp,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Trình bày thuật toán tìm độ dài dãy con tăng dài nhất (LIS) trong $O(n \\log n)$ bằng mảng <code>tails</code> kết hợp tìm kiếm nhị phân. Giải thích ý nghĩa của <code>tails[k]</code> và vì sao mảng này luôn tăng ngặt.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Định nghĩa: <code>tails[k]</code> = phần tử cuối <strong>nhỏ nhất</strong> trong mọi dãy con tăng độ dài $k+1$ xét đến hiện tại.</li><li>Với mỗi $a_i$, tìm vị trí lower bound của $a_i$ trong <code>tails</code> rồi ghi đè; nếu không tìm thấy thì <code>push_back</code>.</li><li>Chứng minh <code>tails</code> tăng ngặt: nếu $tails[k] \\ge tails[k+1]$ thì cắt bớt dãy độ dài $k+2$ sẽ cho dãy độ dài $k+1$ có phần tử cuối nhỏ hơn — mâu thuẫn định nghĩa.</li><li>Đáp số là <code>tails.size()</code>; nhấn mạnh <code>tails</code> <em>không</em> phải một dãy con hợp lệ, muốn truy vết phải lưu thêm mảng cha.</li><li>Độ phức tạp $O(n \\log n)$ do mỗi phần tử tốn một lần nhị phân.</li></ul>',
    },

    // ── Đồ thị và duyệt đồ thị ────────────────────────────────────────────
    {
      key: 'gr-01',
      module: MODULES.graph,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Thuật toán BFS sử dụng cấu trúc dữ liệu nào để quản lý các đỉnh chờ duyệt?</p>',
      options: ['Hàng đợi (queue)', 'Ngăn xếp (stack)', 'Cây nhị phân tìm kiếm', 'Bảng băm'],
      correctIndex: 0,
      explanation:
        '<p>Hàng đợi FIFO đảm bảo các đỉnh được duyệt theo thứ tự tăng dần của khoảng cách tới đỉnh nguồn.</p>',
    },
    {
      key: 'gr-02',
      module: MODULES.graph,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Duyệt DFS trên đồ thị biểu diễn bằng danh sách kề có độ phức tạp:</p>',
      options: ['$O(V)$', '$O(E)$', '$O(V + E)$', '$O(V \\times E)$'],
      correctIndex: 2,
      explanation:
        '<p>Mỗi đỉnh vào ngăn xếp một lần, mỗi cạnh được xét đúng một lần (hai lần với đồ thị vô hướng).</p>',
    },
    {
      key: 'gr-03',
      module: MODULES.graph,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Trên đồ thị <strong>không trọng số</strong>, thuật toán nào cho đường đi ngắn nhất từ một đỉnh nguồn tới mọi đỉnh còn lại với chi phí thấp nhất?</p>',
      options: ['DFS', 'BFS', 'Bellman-Ford', 'Floyd-Warshall'],
      correctIndex: 1,
      explanation:
        '<p>BFS cho kết quả đúng trong $O(V + E)$. Dùng Dijkstra hay Bellman-Ford ở đây là thừa chi phí.</p>',
    },
    {
      key: 'gr-04',
      module: MODULES.graph,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Một đồ thị vô hướng có $6$ đỉnh và các cạnh $\\{1{-}2, 2{-}3, 4{-}5\\}$. Số thành phần liên thông là:</p>',
      options: ['$1$', '$2$', '$3$', '$6$'],
      correctIndex: 2,
      explanation:
        '<p>Ba thành phần: $\\{1,2,3\\}$, $\\{4,5\\}$ và đỉnh cô lập $\\{6\\}$.</p>',
    },
    {
      key: 'gr-05',
      module: MODULES.graph,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Muốn kiểm tra một đồ thị vô hướng liên thông có phải là cây hay không, điều kiện đủ nào sau đây là đúng?</p>',
      options: [
        'Số cạnh bằng $V - 1$',
        'Số cạnh bằng $V$',
        'Mọi đỉnh có bậc chẵn',
        'Tồn tại chu trình Euler',
      ],
      correctIndex: 0,
      explanation:
        '<p>Đồ thị vô hướng liên thông có đúng $V - 1$ cạnh thì không có chu trình, tức là cây.</p>',
    },
    {
      key: 'gr-06',
      module: MODULES.graph,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Trình bày thuật toán Dijkstra dùng hàng đợi ưu tiên để tìm đường đi ngắn nhất từ một đỉnh nguồn. Phân tích độ phức tạp $O((V + E) \\log V)$ và giải thích vì sao thuật toán <strong>không</strong> áp dụng được cho đồ thị có cạnh trọng số âm.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Mô tả: mảng $d[\\,]$ khởi tạo $+\\infty$, $d[s] = 0$; lặp lấy đỉnh $u$ có $d[u]$ nhỏ nhất từ heap, thực hiện nới lỏng (relax) mọi cạnh $u \\to v$.</li><li>Kỹ thuật lazy deletion: bỏ qua đỉnh lấy ra nếu $d$ đã cũ.</li><li>Độ phức tạp: mỗi cạnh có thể đẩy một phần tử vào heap $\\Rightarrow O(E \\log V)$; cộng $O(V \\log V)$ cho các lần lấy ra.</li><li>Lý do hỏng với cạnh âm: bất biến "đỉnh lấy ra khỏi heap đã có $d$ tối ưu" dựa vào giả thiết trọng số không âm; một cạnh âm phía sau có thể làm giảm $d[u]$ sau khi $u$ đã chốt.</li><li>Nêu phản ví dụ nhỏ và giải pháp thay thế: Bellman-Ford $O(VE)$, hoặc SPFA.</li></ul>',
    },
  ],
  exams: [
    {
      key: 'exam-cx',
      title: 'Luyện tập: Độ phức tạp thuật toán',
      module: MODULES.complexity,
      modules: [MODULES.complexity],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-bs',
      title: 'Luyện tập: Tìm kiếm nhị phân',
      module: MODULES.binarySearch,
      modules: [MODULES.binarySearch],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-st',
      title: 'Luyện tập: Sắp xếp',
      module: MODULES.sorting,
      modules: [MODULES.sorting],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-dp',
      title: 'Luyện tập: Quy hoạch động cơ bản',
      module: MODULES.dp,
      modules: [MODULES.dp],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-gr',
      title: 'Luyện tập: Đồ thị và duyệt đồ thị',
      module: MODULES.graph,
      modules: [MODULES.graph],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-mid',
      title: 'Đề kiểm tra giữa khoá — Thuật toán cơ bản',
      module: MODULES.review,
      modules: [MODULES.complexity, MODULES.binarySearch, MODULES.sorting],
      blueprint: { [NB]: 3, [TH]: 4, [VD]: 2, [VDC]: 1 },
    },
    {
      key: 'exam-final',
      title: 'Đề thi cuối khoá — Thuật toán & Cấu trúc dữ liệu',
      module: MODULES.review,
      blueprint: { [NB]: 5, [TH]: 6, [VD]: 3, [VDC]: 1 },
    },
    {
      key: 'exam-warmup',
      title: 'Đề khởi động — Kiểm tra 10 phút',
      module: MODULES.review,
      blueprint: { [NB]: 5 },
    },
    {
      key: 'exam-cluster-2',
      title: 'Đề kiểm tra cụm 2 — Quy hoạch động & Đồ thị',
      module: MODULES.review,
      modules: [MODULES.dp, MODULES.graph],
      blueprint: { [NB]: 2, [TH]: 2, [VD]: 1, [VDC]: 1 },
    },
    {
      key: 'exam-advanced',
      title: 'Đề nâng cao — Vận dụng & Vận dụng cao',
      module: MODULES.review,
      blueprint: { [VD]: 5, [VDC]: 2 },
    },
    {
      key: 'exam-essay',
      title: 'Đề tự luận — Trình bày thuật toán',
      module: MODULES.review,
      blueprint: { [VDC]: 5 },
    },
    {
      // `rotate: 1` = lấy khối câu kế tiếp của `exam-final`, để hai đề cuối khoá không trùng câu.
      key: 'exam-final-2',
      title: 'Đề thi cuối khoá (đề số 2) — Thuật toán & Cấu trúc dữ liệu',
      module: MODULES.review,
      blueprint: { [NB]: 5, [TH]: 6, [VD]: 3, [VDC]: 1 },
      rotate: 1,
    },
  ],
};
