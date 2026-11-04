# VIRTUAL CAFÉ

## Product Specification (SPEC) --- Version 1.0

-   **Loại tài liệu:** Product & Functional Specification
-   **Phiên bản:** 1.0
-   **Trạng thái:** Baseline đề xuất cho MVP
-   **Định hướng sản phẩm:** Virtual Café --- không gian quán cà phê ảo
    để làm việc, học tập và hiện diện cùng đồng đội
-   **Nền tảng phát hành đầu tiên:** Web
-   **Phong cách không gian:** 2.5D Isometric
-   **Mô hình tham gia:** Public Café, Shared World theo các instance

------------------------------------------------------------------------

# 1. Tổng quan sản phẩm

## 1.1. Ý tưởng

Virtual Café là một website mô phỏng trải nghiệm ngồi làm việc trong
quán cà phê. Người dùng có thể mở website vào những ngày không tiện ra
ngoài, chọn chỗ ngồi, nghe nhạc và âm thanh đặc trưng của quán, nhìn
thấy những người khác đang làm việc, sau đó gặp đồng đội tại cùng một
chiếc bàn để trao đổi bằng giọng nói.

Sản phẩm không được định vị là một ứng dụng chat, mạng xã hội hay trò
chơi multiplayer. Hoạt động chính là **làm việc/học tập trong một không
gian có bầu không khí dễ chịu**. Tương tác xã hội chỉ đóng vai trò bổ
trợ và diễn ra tự nhiên như ở một quán cà phê thật.

## 1.2. Tầm nhìn và định vị

**Định vị:** Your favorite café, always within reach.

**Giá trị cốt lõi:** - Biến việc làm việc một mình trước màn hình thành
trải nghiệm có cảm giác đang ở cùng mọi người. - Tái tạo bầu không khí
quán cà phê: ánh sáng ấm, âm nhạc nhẹ, tiếng máy pha cà phê, tiếng trò
chuyện xa xa và hình ảnh mọi người đang làm việc. - Giúp nhóm làm việc
có thể "ngồi cùng nhau" mà không cần tạo một cuộc họp video chính
thức. - Giữ trải nghiệm đơn giản, trưởng thành, tinh tế và không gây xao
nhãng.

## 1.3. Nguyên tắc sản phẩm

1.  **Café first, social second:** không gian và trải nghiệm làm việc
    quan trọng hơn tính năng xã hội.
2.  **Ambient before interaction:** bầu không khí phải có giá trị ngay
    cả khi người dùng chưa tương tác với ai.
3.  **Presence over chat:** sự hiện diện của người khác quan trọng hơn
    việc liên tục nhắn tin.
4.  **Professional but cozy:** chuyên nghiệp nhưng ấm áp; tránh phong
    cách game trẻ con hoặc phần mềm văn phòng khô cứng.
5.  **Real people, honest NPCs:** ưu tiên người dùng thật; NPC chỉ bổ
    sung không khí và phải được nhận diện rõ là nhân vật mô phỏng.
6.  **Low-friction:** vào quán và bắt đầu làm việc nhanh, không yêu cầu
    thiết lập phức tạp.

------------------------------------------------------------------------

# 2. Mục tiêu và ngoài phạm vi

## 2.1. Mục tiêu MVP

-   Người dùng mở website và vào được một quán cà phê công cộng.
-   Người dùng nhìn thấy không gian 2.5D Isometric và các avatar khác.
-   Người dùng di chuyển, chọn ghế, ngồi xuống và đặt trạng thái làm
    việc.
-   Nhiều người có thể cùng xuất hiện trong một instance và nhìn thấy
    trạng thái hiện diện của nhau.
-   Người dùng có thể trò chuyện bằng giọng nói với đồng đội tại cùng
    bàn.
-   Nhạc nền và âm thanh môi trường tạo cảm giác quán cà phê ngay cả khi
    ít người online.
-   Người dùng có quyền kiểm soát micro, âm lượng và chế độ tập trung.
-   Trải nghiệm hoạt động ổn định trên các trình duyệt desktop hiện đại.

## 2.2. Chỉ số thành công đề xuất

Các con số dưới đây là mục tiêu kiểm thử ban đầu, cần hiệu chỉnh sau
beta: - Tỷ lệ người vào quán và ngồi xuống trong phiên đầu. - Thời gian
trung bình ở lại quán. - Tỷ lệ phiên có ít nhất hai người cùng bàn. - Tỷ
lệ người dùng bật âm thanh môi trường hoặc nhạc nền. - Tỷ lệ phiên nhóm
sử dụng voice. - Tỷ lệ quay lại trong 7 ngày. - Tỷ lệ lỗi kết nối, mất
đồng bộ avatar và lỗi voice. - Độ ổn định ở mức 20--25 người/instance
trong bài kiểm thử tải ban đầu.

Không tối ưu MVP theo số lượng tin nhắn, số lượng bạn bè hay thời gian
tương tác xã hội.

## 2.3. Không thuộc MVP

-   Video call và họp trực tuyến.
-   Hệ thống bạn bè, follow, newsfeed hoặc mạng xã hội.
-   Nhiều loại quán/cửa hàng và hệ thống kinh tế trong game.
-   Marketplace, mua bán vật phẩm hoặc thanh toán trong không gian.
-   AI hội thoại cho NPC.
-   Hệ thống sự kiện, nhiệm vụ, phần thưởng và gamification phức tạp.
-   Mobile app native. Giao diện web cần responsive ở mức cơ bản, nhưng
    trải nghiệm tương tác chính ưu tiên desktop.
-   Ghi âm hoặc lưu trữ hội thoại người dùng.

> **Sửa đổi sau v1.0 --- Chia sẻ màn hình theo bàn.** Bản v1.0 xếp "chia sẻ
> màn hình" vào phần ngoài MVP. Hạng mục này đã được đưa trở lại phạm vi và
> triển khai theo một spec riêng, với giới hạn chặt chẽ: chỉ những người
> **ngồi cùng một bàn** mới xem được, mỗi bàn chỉ có **một người chia sẻ** tại
> một thời điểm, và luồng hình đi qua một phòng LiveKit **riêng của bàn đó**,
> tách khỏi phòng thoại. Phần còn lại của mục 2.3 --- video call, họp trực
> tuyến, ghi âm hay lưu trữ nội dung --- vẫn nằm ngoài phạm vi.
>
> Xem `README.md` (mục "Chia sẻ màn hình theo bàn") và `tasks/plan.md`.

------------------------------------------------------------------------

# 3. Người dùng mục tiêu và tình huống sử dụng

## 3.1. Personas

### Persona A --- Người làm việc độc lập

-   Làm việc từ nhà hoặc làm việc tự do.
-   Muốn có cảm giác không gian làm việc bên ngoài nhà.
-   Không nhất thiết muốn trò chuyện với người khác.
-   Cần nhạc nền, ambience và trạng thái tập trung.

### Persona B --- Nhóm làm việc nhỏ

-   Hai đến sáu người thường xuyên làm việc cùng nhau.
-   Muốn ngồi cùng một bàn và trao đổi nhanh trong lúc làm.
-   Không muốn phải mở một cuộc họp video chính thức.
-   Cần voice ổn định và khả năng tìm thấy nhau trong quán.

### Persona C --- Người học tập/làm việc cần động lực

-   Muốn nhìn thấy người khác cũng đang học hoặc làm việc.
-   Cần cảm giác có cộng đồng nhưng không bị ép tương tác.
-   Có thể sử dụng Focus Mode để hạn chế xao nhãng.

## 3.2. Kịch bản tham chiếu quan trọng nhất

Một buổi chiều mưa. Người dùng không muốn ra ngoài nhưng vẫn muốn làm
việc trong không khí quán cà phê. Họ mở Virtual Café, nhìn thấy ánh đèn
ấm, cửa kính có mưa, nhạc jazz nhẹ, một vài người đang làm việc với
laptop và nhóm nhỏ đang trao đổi ở bàn dài. Người dùng chọn bàn cạnh cửa
sổ, ngồi xuống, bật trạng thái Working. Sau đó đồng đội vào quán, tìm
đến bàn và bật micro để làm việc cùng nhau. Không cần tạo meeting link
hay bật camera; mọi người chỉ đơn giản đang ngồi cùng nhau trong quán.

Mọi quyết định UX, art direction và sound design cần hỗ trợ kịch bản
này.

------------------------------------------------------------------------

# 4. Trải nghiệm sản phẩm và luồng người dùng

## 4.1. Luồng vào quán

1.  Người dùng mở website.
2.  Xem màn hình giới thiệu ngắn, có nút "Enter Café".
3.  Người dùng có thể vào bằng guest session ở MVP.
4.  Website tải map và kết nối realtime.
5.  Hệ thống tự động gán người dùng vào một instance còn chỗ.
6.  Người dùng xuất hiện tại khu vực vào quán.
7.  Người dùng có thể di chuyển, chọn chỗ ngồi và điều chỉnh âm thanh.

Đăng ký tài khoản có thể được bổ sung khi cần lưu avatar, tuỳ chọn và
lịch sử sử dụng. Không chặn trải nghiệm thử quán bằng một quy trình
onboarding dài.

## 4.2. Luồng làm việc cá nhân

1.  Vào quán.
2.  Chọn bàn đơn hoặc chỗ cạnh cửa sổ.
3.  Ngồi xuống.
4.  Chọn trạng thái Working hoặc Focus.
5.  Điều chỉnh nhạc nền và âm thanh môi trường.
6.  Làm việc mà không cần tương tác xã hội.

## 4.3. Luồng làm việc nhóm

1.  Thành viên vào cùng public café.
2.  Người dùng tìm đồng đội qua danh sách người trong instance hoặc nhận
    diện avatar trên map.
3.  Di chuyển đến bàn nhóm.
4.  Chọn ghế còn trống.
5.  Chủ động bật micro và tham gia voice.
6.  Khi rời bàn hoặc tắt micro, trạng thái được cập nhật.

MVP có thể dùng mã tham gia nhóm hoặc lời mời đơn giản nếu việc tìm đồng
đội trong public café chưa đủ thuận tiện. Không cần xây dựng hệ thống
bạn bè đầy đủ.

## 4.4. Onboarding

Onboarding nên ngắn, trực quan và có thể bỏ qua: - Hướng dẫn di chuyển:
WASD/phím mũi tên hoặc click-to-move nếu được hỗ trợ. - Hướng dẫn chọn
ghế và ngồi xuống. - Giải thích biểu tượng micro và trạng thái voice. -
Giải thích các thanh âm lượng. - Nhắc người dùng cần cấp quyền micro
trước khi trò chuyện. - Cho phép kiểm tra âm thanh và micro. - Có nút
"Don't show again".

Không tự động bật micro khi người dùng vừa vào quán.

------------------------------------------------------------------------

# 5. Thiết kế không gian và bản đồ

## 5.1. Phong cách hình ảnh

**2.5D Isometric** với góc nhìn chéo cố định, chiều sâu giả lập bằng
tile/object layering và bóng đổ. Phong cách hướng đến một quán specialty
coffee hiện đại, ấm áp và tinh tế.

### Art direction

-   Vật liệu: gỗ, đá, vải, kim loại sơn mờ, kính và cây xanh.
-   Bảng màu: nâu gỗ, kem, beige, olive, xám ấm và điểm nhấn màu cà phê.
-   Ánh sáng: vàng ấm vừa phải, ánh sáng tự nhiên từ cửa sổ.
-   Nội thất: bàn ghế có tỷ lệ thực tế, ghế thoải mái, quầy bar tinh
    gọn.
-   Tránh: màu neon quá mạnh, UI kiểu game fantasy, hiệu ứng particle
    dày đặc và chuyển động liên tục gây mất tập trung.

## 5.2. Cấu trúc map MVP

Một quán cà phê duy nhất, có các khu vực tự nhiên: - **Entrance:** cửa
ra vào và khu vực xuất hiện ban đầu. - **Window Seats:** bàn cạnh cửa
sổ, phù hợp làm việc cá nhân hoặc hai người. - **Solo Tables:** bàn đơn
cho người muốn tập trung. - **Community Table:** bàn dài cho người làm
việc cạnh nhau. - **Group Table:** bàn nhóm khoảng 3--4 người. -
**Lounge Sofa:** khu vực thư giãn và trò chuyện nhẹ. -
**Counter/Barista:** quầy pha chế, điểm nhấn thị giác và âm thanh. -
**Plants & Decor:** cây xanh, kệ sách, tranh, đèn và vật trang trí. -
**Windows:** thể hiện bối cảnh mưa, nắng hoặc ánh sáng ngoài trời.

Không chia map thành các phòng voice cứng nhắc. Bố trí nội thất tạo cảm
giác tự nhiên; quyền nghe voice được quản lý theo nhóm/bàn và quy tắc
riêng tư.

## 5.3. Hệ thống ghế

Mỗi ghế có: - `seatId` - Vị trí và hướng ngồi - Nhóm bàn - Sức chứa hoặc
loại ghế - Trạng thái trống/đã có người - Vùng tương tác - Điểm đặt
avatar khi ngồi

Quy tắc: - Một ghế chỉ có một người tại một thời điểm. - Server là nguồn
xác thực cuối cùng cho việc chiếm ghế. - Khi người dùng disconnect quá
thời gian grace period, ghế được giải phóng. - Người dùng có thể đứng
dậy bất kỳ lúc nào. - Không cho phép avatar ngồi chồng lên nhau.

## 5.4. Di chuyển và va chạm

-   Hỗ trợ di chuyển bằng WASD/phím mũi tên.
-   Có thể bổ sung click-to-move sau MVP.
-   Không đi xuyên tường, bàn, quầy và vật cản.
-   Có thể dùng navigation grid hoặc polygon collision.
-   Server xác thực vị trí và giới hạn tốc độ di chuyển.
-   Client nội suy chuyển động để giảm cảm giác giật.

Công thức chuyển đổi tọa độ tham khảo cho tile isometric:

``` text
screenX = (worldX - worldY) * tileWidth / 2
screenY = (worldX + worldY) * tileHeight / 2
```

Cần thống nhất hệ tọa độ world và screen trong engine; không dùng tọa độ
screen làm dữ liệu authoritative.

------------------------------------------------------------------------

# 6. Hệ thống âm thanh

Âm thanh là một phần cốt lõi của sản phẩm, không phải tính năng phụ.

## 6.1. Các lớp âm thanh

1.  **Background Music:** jazz nhẹ, lo-fi, piano, acoustic hoặc
    instrumental.
2.  **Café Ambience:** tiếng máy pha cà phê, ly tách, cửa mở, ghế dịch
    chuyển, tiếng gõ bàn phím và âm thanh không gian.
3.  **Weather Ambience:** tiếng mưa hoặc gió tuỳ bối cảnh.
4.  **Ambient Crowd:** lớp âm thanh trò chuyện xa được tạo từ audio
    asset đã được cấp phép.
5.  **Live Conversation:** voice trực tiếp từ người dùng thật.
6.  **UI Sounds:** âm báo nhỏ cho các hành động cần phản hồi.

Các lớp phải có volume control độc lập. Người dùng có thể tắt từng lớp
mà không ảnh hưởng các lớp khác.

## 6.2. Voice và quyền riêng tư

Phải phân biệt rõ: - **Ambient Crowd:** âm thanh nền được dựng sẵn,
không phải hội thoại trực tiếp của người dùng. - **Live Conversation:**
giọng nói thật, chỉ phát cho những người được phép tham gia cuộc trò
chuyện.

Không được giả lập việc người lạ đang nói chuyện bằng cách phát lại
giọng nói của người dùng khác cho toàn bộ quán. Không để người ở bàn
khác nghe rõ cuộc trò chuyện riêng tư theo mặc định.

### Quy tắc voice MVP

-   Voice nhóm được gắn với bàn hoặc conversation group.
-   Người dùng phải chủ động bật micro.
-   UI luôn hiển thị trạng thái micro đang bật.
-   Người dùng có thể mute bản thân, mute người khác ở phía client,
    block hoặc report.
-   Voice chỉ được gửi đến thành viên được phép trong conversation
    group.
-   Người ngoài nhóm không được tự động subscribe vào luồng voice riêng.
-   Focus Mode có thể tắt thông báo và giảm/tắt voice không thuộc nhóm
    đã chọn; không âm thầm thay đổi quyền riêng tư.

Nếu muốn hỗ trợ voice theo khoảng cách trong phiên bản sau, cần thiết kế
subscription filtering ở server/SFU, spatial attenuation và hysteresis.
Chỉ giảm volume ở client không giúp giảm băng thông vì audio track vẫn
có thể đang được truyền.

## 6.3. Công nghệ voice

Có thể đánh giá LiveKit hoặc một SFU tương đương. Trước khi chốt cần làm
prototype kiểm chứng: - Khả năng cấp token và join room. -
Subscribe/unsubscribe track theo quyền và khoảng cách. - Chất lượng
voice khi nhiều nhóm nói đồng thời. - Chi phí theo participant-minute và
băng thông. - Khả năng hoạt động trên các trình duyệt mục tiêu. - Quy
trình reconnect và xử lý thiết bị audio.

Không giả định rằng cùng một LiveKit room sẽ tự động cung cấp proximity
voice. Logic phân quyền, nhóm hội thoại và subscription cần được xây
dựng rõ ràng.

## 6.4. Quyền điều khiển âm thanh

Các control tối thiểu: - Master volume - Music volume - Café ambience
volume - Weather volume - Live voice volume - Mute all - Microphone
on/off - Output device (nếu trình duyệt hỗ trợ) - Focus Mode

Lưu tuỳ chọn âm thanh ở local storage trước; đồng bộ lên tài khoản khi
có hệ thống account.

------------------------------------------------------------------------

# 7. Avatar, hiện diện và trạng thái

## 7.1. Avatar MVP

-   Một bộ avatar cơ bản có thể phân biệt được.
-   Hướng nhìn và animation theo hướng di chuyển.
-   Animation đứng yên, đi bộ, ngồi và thao tác làm việc.
-   Không cần hệ thống trang phục hoặc marketplace ở MVP.

## 7.2. Trạng thái người dùng

Các trạng thái: - `Available` - `Working` - `Focus` - `Away` -
`In Conversation`

Trạng thái hiển thị bằng icon hoặc nhãn nhỏ, không dùng hiệu ứng nổi bật
gây rối.

## 7.3. Presence

Các thông tin realtime: - User ID/session ID - Avatar ID - Vị trí -
Hướng - Trạng thái - Ghế đang sử dụng - Voice state - Instance ID

Không cần lưu từng frame di chuyển vào database. Presence và vị trí tức
thời nằm trong bộ nhớ realtime/Redis; chỉ lưu dữ liệu bền vững khi thực
sự cần.

------------------------------------------------------------------------

# 8. NPC và cảm giác quán luôn có sức sống

NPC chỉ là giải pháp bổ trợ khi lượng người dùng thật còn thấp.

## 8.1. NPC MVP

Có thể dùng 2--4 NPC được đặt sẵn hoặc spawn có kiểm soát: - Người đang
đọc sách. - Người đang làm việc với laptop. - Nhân viên quầy barista. -
Một nhóm nhỏ đang trò chuyện bằng animation.

## 8.2. Nguyên tắc

-   NPC phải có dấu hiệu nhận diện rõ trong UI hoặc thông tin trợ giúp.
-   Không giả vờ NPC là người dùng thật.
-   Không cần AI hội thoại.
-   Chỉ cần animation theo chu kỳ và vài hành vi có điều kiện.
-   NPC không chiếm ghế người dùng cần.
-   NPC không tạo voice giả giống hội thoại thật; sử dụng soundscape
    được cấp phép.

NPC là P1, có thể bỏ khỏi bản MVP đầu tiên nếu nguồn lực hạn chế.

------------------------------------------------------------------------

# 9. Tính năng và yêu cầu chức năng

Mức ưu tiên: - **P0:** bắt buộc để kiểm chứng giá trị cốt lõi. - **P1:**
nên có sau khi luồng chính ổn định. - **P2:** mở rộng sau MVP.

  -----------------------------------------------------------------------
  ID                Tính năng         Mô tả             Ưu tiên
  ----------------- ----------------- ----------------- -----------------
  FR-001            Enter Café        Vào public café   P0
                                      bằng guest        
                                      session           

  FR-002            Instance          Tự động đưa người P0
                    assignment        dùng vào instance 
                                      còn chỗ           

  FR-003            Isometric map     Hiển thị map và   P0
                                      nội thất 2.5D     

  FR-004            Avatar movement   Di chuyển và đồng P0
                                      bộ vị trí         

  FR-005            Collision         Không đi xuyên    P0
                                      vật cản           

  FR-006            Realtime presence Thấy người khác   P0
                                      vào/ra/di chuyển  

  FR-007            Seat interaction  Chọn ghế, ngồi và P0
                                      đứng dậy          

  FR-008            Work status       Đặt trạng thái    P0
                                      Working/Focus     

  FR-009            Background music  Phát nhạc nền có  P0
                                      quyền sử dụng     

  FR-010            Café ambience     Phát âm thanh môi P0
                                      trường            

  FR-011            Audio controls    Điều chỉnh từng   P0
                                      lớp âm thanh      

  FR-012            Group voice       Voice trong       P0
                                      nhóm/bàn được     
                                      phép              

  FR-013            Microphone        Người dùng chủ    P0
                    consent           động bật/tắt      
                                      micro             

  FR-014            Reconnect         Khôi phục phiên   P0
                                      sau mất mạng ngắn 

  FR-015            Focus Mode        Giảm xao nhãng và P1
                                      điều chỉnh thông  
                                      báo               

  FR-016            Basic text chat   Tin nhắn ngắn     P1
                                      trong nhóm/bàn    

  FR-017            Ambient NPC       Nhân vật nền có   P1
                                      animation         

  FR-018            Avatar            Tuỳ chỉnh avatar  P2
                    customization     cơ bản            

  FR-019            Pomodoro          Bộ đếm thời gian  P2
                                      tập trung         

  FR-020            Order counter     Tương tác gọi món P2
                                      mang tính trang   
                                      trí               

  FR-021            Request music     Đề xuất           P2
                                      bài/playlist      
                                      trong danh sách   
                                      được cấp phép     
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 10. Giao diện và UX

## 10.1. Bố cục chính

-   **Canvas trung tâm:** map isometric.
-   **Thanh trạng thái nhỏ:** avatar, trạng thái hiện tại.
-   **Audio dock:** nhạc, ambience, voice và mute.
-   **People panel:** danh sách người trong instance, trạng thái và vị
    trí/khu vực.
-   **Interaction prompt:** xuất hiện khi đứng gần ghế hoặc vật thể
    tương tác.
-   **Settings:** thiết bị âm thanh, điều khiển, chất lượng hình ảnh và
    accessibility.

UI nên gọn, không che map. Các thành phần có thể thu gọn.

## 10.2. Nguyên tắc UX

-   Vào quán nhanh, không bắt buộc tạo profile dài.
-   Không tự động bật micro.
-   Không tự động phát voice.
-   Có trạng thái rõ ràng khi đang phát nhạc, đang bật micro hoặc đang
    Focus.
-   Các nút quan trọng có tooltip và nhãn dễ hiểu.
-   Không phụ thuộc hoàn toàn vào màu sắc để truyền đạt trạng thái.
-   Hỗ trợ giảm chuyển động và tắt hiệu ứng không cần thiết.
-   Có thông báo rõ khi trình duyệt chưa cấp quyền micro hoặc audio
    playback bị chặn.

## 10.3. Responsive

MVP ưu tiên desktop/laptop vì cần điều khiển avatar và voice. Trên màn
hình nhỏ: - Cho phép xem không gian và danh sách người. - Có thể dùng
điều khiển chạm cơ bản nếu khả thi. - Không cam kết trải nghiệm mobile
tương đương desktop ở phiên bản đầu. - Kiểm thử layout ở tablet và
mobile để tránh vỡ giao diện.

------------------------------------------------------------------------

# 11. Kiến trúc kỹ thuật đề xuất

Đây là kiến trúc tham khảo để đội ngũ kỹ thuật đánh giá và chốt theo
năng lực thực tế.

## 11.1. Frontend

-   Next.js + TypeScript cho website, routing và các màn hình ngoài
    game.
-   Phaser 3 hoặc engine 2D phù hợp để render map isometric, avatar,
    animation và input.
-   Tailwind CSS cho UI.
-   Zustand hoặc state management tương đương cho client state.
-   WebSocket/Socket.IO client cho realtime presence.
-   Web Audio API cho các lớp âm thanh ambience/music.
-   SDK của LiveKit hoặc SFU đã chọn cho voice.

Cần phân định rõ UI website và canvas game: canvas chịu trách nhiệm thế
giới 2.5D; React chịu trách nhiệm panel, controls, settings và
onboarding.

## 11.2. Backend

-   NestJS + TypeScript.
-   Socket.IO hoặc WebSocket gateway cho realtime events.
-   PostgreSQL cho dữ liệu bền vững.
-   Redis cho presence, instance state, seat locks và pub/sub khi scale.
-   LiveKit hoặc SFU tương đương cho voice.
-   Object storage/CDN cho asset.
-   Docker cho môi trường phát triển và triển khai.

## 11.3. Mô hình instance

Người dùng nhìn thấy một public café duy nhất, nhưng backend có thể vận
hành nhiều instance giống nhau.

Ví dụ ban đầu: 20--25 người/instance để kiểm thử, không phải giới hạn
sản phẩm đã được xác nhận.

Luồng: 1. Client yêu cầu vào café. 2. Matchmaker tìm instance còn chỗ.
3. Backend cấp session và thông tin kết nối. 4. Client kết nối realtime
gateway. 5. Server gửi snapshot trạng thái hiện tại. 6. Các event tiếp
theo được broadcast trong phạm vi instance. 7. Khi instance đầy, tạo
hoặc chọn instance khác.

Người dùng ở hai instance khác nhau không nhìn thấy presence và không
nghe voice của nhau.

## 11.4. Realtime authority

Server authoritative đối với: - Vị trí hợp lệ và tốc độ di chuyển. - Va
chạm quan trọng. - Quyền chiếm ghế. - Join/leave instance. - Quyền tham
gia voice group. - Trạng thái presence chính thức.

Client có thể dự đoán chuyển động và nội suy để tạo cảm giác mượt, nhưng
không tự quyết định trạng thái quan trọng.

## 11.5. Luồng sự kiện realtime

Ví dụ event: - `world:join` - `world:leave` - `player:move` -
`player:state` - `player:sit` - `player:stand` - `seat:occupied` -
`voice:join` - `voice:leave` - `voice:state` - `chat:send` -
`chat:received`

Mỗi event cần có schema, validation, authorization, rate limit và
versioning phù hợp. Không nhận `instanceId` từ client như một sự thật
đáng tin cậy; server xác định session thuộc instance nào.

------------------------------------------------------------------------

# 12. Database và dữ liệu

Schema dưới đây là baseline logic, cần được chuyển thành migration cụ
thể khi triển khai.

## 12.1. Bảng chính

### users

-   `id`
-   `created_at`
-   `updated_at`
-   `display_name`
-   `status`
-   `auth_provider` (nullable nếu guest)
-   `auth_subject` (nullable)

### user_preferences

-   `user_id`
-   `music_volume`
-   `ambience_volume`
-   `weather_volume`
-   `voice_volume`
-   `master_volume`
-   `reduced_motion`
-   `updated_at`

### avatars

-   `id`
-   `user_id`
-   `avatar_config`
-   `created_at`
-   `updated_at`

### worlds

-   `id`
-   `name`
-   `map_version`
-   `is_active`

### world_instances

-   `id`
-   `world_id`
-   `region`
-   `capacity`
-   `status`
-   `created_at`

### seat_definitions

-   `id`
-   `world_id`
-   `seat_group_id`
-   `position_x`
-   `position_y`
-   `facing`
-   `seat_type`
-   `map_version`

Ghế là dữ liệu cấu hình map, không cần tạo bản ghi mới mỗi lần có người
ngồi.

### moderation_reports

-   `id`
-   `reporter_user_id`
-   `reported_user_id`
-   `reason`
-   `details`
-   `created_at`
-   `status`

### user_blocks

-   `blocker_user_id`
-   `blocked_user_id`
-   `created_at`

## 12.2. Dữ liệu realtime

Không cần persist liên tục: - Vị trí avatar từng tick. - Hướng di chuyển
tức thời. - Trạng thái kết nối tạm thời. - Seat occupancy hiện thời. -
Voice group membership.

Các dữ liệu này có thể nằm trong memory của realtime server và/hoặc
Redis, có TTL và cơ chế dọn dẹp khi disconnect.

------------------------------------------------------------------------

# 13. API và giao tiếp

API cụ thể có thể thay đổi theo framework; các endpoint dưới đây mô tả
năng lực cần có.

## 13.1. HTTP API

-   `POST /auth/guest` --- tạo guest session.
-   `GET /me` --- lấy profile hiện tại.
-   `PATCH /me/profile` --- cập nhật display name/avatar.
-   `GET /cafe` --- lấy thông tin public café.
-   `POST /cafe/join` --- xin vào café, server chọn instance.
-   `POST /cafe/leave` --- rời café.
-   `POST /voice/token` --- cấp token voice có scope và thời hạn.
-   `POST /moderation/reports` --- gửi report.
-   `POST /users/:id/block` --- block người dùng.

## 13.2. Socket event payload mẫu

``` json
{
  "event": "player:move",
  "payload": {
    "sequence": 104,
    "x": 12.5,
    "y": 8.25,
    "direction": "south_east"
  }
}
```

Server phải kiểm tra: - Session hợp lệ. - User thuộc instance tương
ứng. - Tốc độ và vị trí hợp lệ. - Tần suất event không vượt ngưỡng. -
Payload đúng schema.

Không tin cậy dữ liệu do client gửi về ghế, instance hoặc quyền voice.

------------------------------------------------------------------------

# 14. Bảo mật, quyền riêng tư và moderation

## 14.1. Bảo mật

-   HTTPS/WSS bắt buộc ở production.
-   Access token có thời hạn; refresh/session strategy rõ ràng.
-   Validate toàn bộ payload từ client.
-   Rate limit các event di chuyển, chat, join/leave và report.
-   Không để client tự chọn instance hoặc tự cấp quyền voice.
-   Voice token có scope, room và thời hạn ngắn.
-   Secrets không được đưa vào frontend bundle.
-   Log không lưu nội dung voice.
-   Có cơ chế chống spam, reconnect abuse và chiếm ghế đồng thời.

## 14.2. Quyền riêng tư voice

-   Micro mặc định tắt.
-   Có chỉ báo rõ ràng khi micro đang bật.
-   Người dùng chủ động tham gia nhóm voice.
-   Có thể rời voice mà vẫn ở lại quán.
-   Có mute, block và report.
-   Không ghi âm mặc định.
-   Chính sách dữ liệu và thông báo quyền riêng tư phải được công bố
    trước khi phát hành công khai.

## 14.3. Moderation MVP

-   Mute bản thân.
-   Mute người khác ở client.
-   Block người dùng.
-   Report người dùng với lý do.
-   Rate limit chat.
-   Có thể kick/ban session ở phía quản trị.
-   Admin action cần có audit log.

------------------------------------------------------------------------

# 15. Danh mục assets cần chuẩn bị

Danh mục này là baseline để tạo backlog cho art, animation, audio và UI.
Ưu tiên asset có thể tái sử dụng theo tile/object, tránh vẽ toàn bộ map
thành một ảnh duy nhất.

## 15.1. Environment --- Map assets

### A. Tiles và cấu trúc

-   Floor tile gỗ.
-   Floor tile đá/xi măng.
-   Floor tile thảm.
-   Wall segment các hướng.
-   Góc tường trong/ngoài.
-   Cửa ra vào.
-   Cửa kính/cửa sổ.
-   Khung cửa sổ.
-   Bậc/thềm nếu có.
-   Viền sàn và transition giữa vật liệu.

### B. Nội thất

-   Bàn đơn.
-   Bàn đôi.
-   Bàn dài community.
-   Bàn nhóm.
-   Ghế đơn.
-   Ghế bar.
-   Sofa đôi/ba.
-   Quầy barista.
-   Kệ trưng bày.
-   Kệ sách.
-   Đèn bàn.
-   Đèn treo/trần.
-   Thùng rác.
-   Bảng menu.
-   Ổ cắm/trang trí tường.

### C. Đạo cụ café

-   Máy espresso.
-   Máy xay cà phê.
-   Bình pour-over.
-   Ấm nước.
-   Ly giấy.
-   Tách sứ.
-   Đĩa.
-   Khay.
-   Bình nước.
-   Hũ hạt cà phê.
-   Túi cà phê.
-   Laptop.
-   Sổ tay.
-   Sách.
-   Điện thoại.
-   Tai nghe.
-   Chậu cây nhỏ.
-   Bình hoa.

### D. Trang trí

-   Cây lớn và cây nhỏ.
-   Tranh treo tường.
-   Đồng hồ.
-   Rèm cửa.
-   Thảm.
-   Gối sofa.
-   Vật trang trí trên kệ.
-   Đèn trang trí.
-   Biển hiệu café.

## 15.2. Character assets

### Avatar

-   Bộ base avatar có tỷ lệ nhất quán.
-   Các hướng: north, south, east, west và hướng chéo cần thiết.
-   Animation idle.
-   Animation walk.
-   Animation sit.
-   Animation work/laptop.
-   Animation wave (P1).
-   Animation stand-up.
-   Shadow/sorting layer.

### NPC (P1)

-   Barista idle/work.
-   Khách ngồi đọc sách.
-   Khách làm việc với laptop.
-   Nhóm khách trò chuyện bằng animation.
-   Bộ animation tối giản, không cần AI.

## 15.3. UI assets

-   Logo và wordmark.
-   App icon/favicon.
-   Nút Enter Café.
-   Icon trạng thái Working, Focus, Away.
-   Icon micro on/off.
-   Icon speaker/volume.
-   Icon music.
-   Icon ambience.
-   Icon weather.
-   Icon seat/interact.
-   Icon people list.
-   Icon settings.
-   Icon mute/block/report.
-   Tooltip và interaction prompt.
-   Loading screen.
-   Empty state.
-   Connection lost/reconnecting state.
-   Permission denied state.
-   Onboarding illustrations (có thể dùng icon và hình đơn giản).

## 15.4. Audio assets

### Music

-   3--5 playlist hoặc nhóm nhạc nền có giấy phép phù hợp.
-   Jazz instrumental.
-   Lo-fi instrumental.
-   Piano/acoustic instrumental.
-   Track có độ động thấp, không gây xao nhãng.

### Café ambience

-   Room tone quán cà phê.
-   Máy espresso.
-   Máy xay cà phê.
-   Tiếng ly tách.
-   Tiếng cửa mở/đóng.
-   Tiếng ghế dịch chuyển.
-   Tiếng gõ bàn phím ở mức nền.
-   Tiếng bước chân nhẹ.

### Weather

-   Mưa nhẹ ngoài cửa kính.
-   Mưa vừa.
-   Gió nhẹ.
-   Có thể bổ sung ambience nắng/ngoài phố về sau.

### UI sounds

-   Join café.
-   Sit/stand.
-   Toggle micro.
-   Notification nhẹ.
-   Error/connection feedback.

**Lưu ý bản quyền:** chỉ sử dụng nhạc và sound effect tự tạo, mua
license hoặc có giấy phép cho phép sử dụng trong sản phẩm thương mại.
Lưu metadata nguồn, license, phạm vi sử dụng và thời hạn nếu có. Không
lấy nhạc phổ biến từ nền tảng streaming rồi phát lại trong ứng dụng.

## 15.5. VFX và animation phụ

-   Bóng đổ dưới avatar và nội thất.
-   Ánh sáng cửa sổ thay đổi nhẹ.
-   Mưa ngoài cửa kính (có thể dùng loop).
-   Hơi nước/steam ở máy pha cà phê.
-   Đèn nhấp nháy rất nhẹ nếu phù hợp.
-   Hiệu ứng tương tác ghế.
-   Không dùng particle dày hoặc animation quá nổi bật.

## 15.6. Asset specification và quy chuẩn

Mỗi asset cần metadata: - `asset_id` - Tên - Nhóm - Kích thước -
Pivot/origin - Hướng isometric - Layer/sorting rule - Animation state
(nếu có) - File format - License/source - Phiên bản

Đề xuất quy chuẩn: - Chốt tile size, camera angle, pixel density và
palette trước khi sản xuất hàng loạt. - Dùng PNG/WebP cho sprite và
texture phù hợp. - Dùng sprite atlas để giảm số draw calls khi engine hỗ
trợ. - Dùng OGG/MP3 cho audio theo khả năng tương thích và pipeline. -
Tách ambience thành loop có điểm nối mượt. - Có bản audio nén cho web và
preload có kiểm soát. - Không tải toàn bộ audio chất lượng cao ngay khi
người dùng mở trang. - Dùng CDN và cache versioned asset.

## 15.7. Asset backlog theo mức ưu tiên

  Nhóm     Asset                                       Ưu tiên
  -------- ------------------------------------------- ---------
  Map      Floor, wall, cửa, cửa sổ                    P0
  Map      Bàn, ghế, quầy, sofa                        P0
  Map      Đèn, cây, tranh và decor cơ bản             P0
  Avatar   Base avatar + idle + walk                   P0
  Avatar   Sit + work animation                        P0
  UI       Logo, audio controls, status, interaction   P0
  Audio    Café room tone + espresso + cup sounds      P0
  Audio    2--3 playlist nhạc nền có license           P0
  Audio    Mưa nhẹ                                     P1
  NPC      Barista và khách ngồi                       P1
  VFX      Steam, window rain, subtle lighting         P1
  Avatar   Nhiều outfit/appearance                     P2
  Map      Nhiều layout/quán khác nhau                 P2

## 15.8. Gợi ý pipeline tạo assets

-   Dùng công cụ vẽ 2D như Aseprite, Krita, Photoshop hoặc Affinity để
    tạo sprite/tile.
-   Dùng Blender nếu cần dựng nội thất 3D rồi render ra góc isometric
    đồng nhất.
-   Dùng AI tạo concept art/reference để khám phá phong cách; không nên
    đưa ảnh AI chưa chuẩn hoá trực tiếp vào game vì dễ lệch góc nhìn, tỷ
    lệ, ánh sáng và phong cách.
-   Chuẩn hoá asset cuối cùng bằng quy trình kiểm tra pivot, kích thước,
    palette, outline, shadow và license.
-   Lưu source file và export file riêng biệt.

------------------------------------------------------------------------

# 16. Hiệu năng và yêu cầu phi chức năng

## 16.1. Performance

Mục tiêu ban đầu cần kiểm chứng: - Tải map ban đầu nhanh trên kết nối
broadband phổ biến. - Chuyển động avatar mượt trên laptop cấu hình trung
bình. - Có giới hạn FPS hoặc adaptive quality khi thiết bị yếu. - Audio
loop không tạo khoảng ngắt rõ rệt. - Không tải toàn bộ asset không cần
thiết. - Realtime event có throttle và snapshot recovery.

## 16.2. Reliability

-   Reconnect khi mạng gián đoạn.
-   Không để avatar ma tồn tại vô hạn.
-   Ghế tự giải phóng khi session hết hạn.
-   Có heartbeat và timeout.
-   Nếu voice lỗi, người dùng vẫn có thể ở lại quán.
-   Nếu realtime gateway lỗi, UI hiển thị trạng thái rõ ràng.

## 16.3. Accessibility

-   Có thể tắt nhạc, ambience và hiệu ứng.
-   Có reduced motion.
-   Trạng thái không chỉ thể hiện bằng màu.
-   Có nhãn/tooltip cho icon.
-   Hỗ trợ keyboard navigation cho UI ngoài canvas.
-   Không dùng âm thanh làm tín hiệu duy nhất cho hành động quan trọng.

## 16.4. Observability

-   Error tracking frontend/backend.
-   Metrics về concurrent users, instance occupancy, socket disconnect,
    voice join failure và latency.
-   Structured logs có correlation/session ID.
-   Không log token, thông tin nhạy cảm hoặc nội dung voice.
-   Dashboard vận hành cho instance và voice health.

------------------------------------------------------------------------

# 17. Kiểm thử và tiêu chí nghiệm thu

## 17.1. Functional acceptance

-   Người dùng vào public café thành công.
-   Hệ thống gán instance hợp lệ.
-   Người dùng thấy avatar khác trong cùng instance.
-   Di chuyển và va chạm đúng.
-   Hai người không thể chiếm cùng một ghế.
-   Ngồi/đứng cập nhật realtime.
-   Trạng thái Working/Focus hiển thị đúng.
-   Nhạc và ambience có volume độc lập.
-   Micro mặc định tắt.
-   Voice chỉ đến đúng nhóm được cấp quyền.
-   Người dùng có thể rời voice mà không rời café.
-   Reconnect không tạo avatar hoặc ghế bị kẹt.
-   Người ở instance khác không thấy hoặc nghe người trong instance hiện
    tại.

## 17.2. Load và soak test

-   Kiểm thử 5, 10, 20 và 25 người/instance.
-   Kiểm thử nhiều instance song song.
-   Kiểm thử nhiều nhóm voice hoạt động đồng thời.
-   Kiểm thử người dùng reconnect liên tục.
-   Kiểm thử người dùng rời trang đột ngột.
-   Kiểm thử audio trên Chrome, Edge và Safari phiên bản được hỗ trợ.
-   Đo CPU, memory, bandwidth, event rate và voice latency.

## 17.3. Privacy/security test

-   Không thể lấy voice token của người khác.
-   Không thể join voice group trái phép.
-   Không thể gửi event cho instance khác.
-   Không thể chiếm ghế bằng race condition.
-   Block/mute có tác dụng đúng.
-   Micro không tự bật sau reconnect.
-   Không có voice recording ngoài ý muốn.

------------------------------------------------------------------------

# 18. Roadmap triển khai

## Phase 0 --- Technical & Art Prototype

Mục tiêu: giảm rủi ro trước khi làm toàn bộ sản phẩm. - Prototype map
isometric nhỏ. - Kiểm tra sorting/layering và collision. - Prototype
avatar movement. - Prototype một bàn và seat interaction. - Prototype âm
thanh nhiều lớp. - Prototype voice group với SFU. - Đo thử hiệu năng và
chi phí.

**Exit criteria:** chứng minh được map, di chuyển, ngồi và voice nhóm
hoạt động trong một browser session có nhiều client.

## Phase 1 --- Core Café MVP

-   Landing/Enter Café.
-   Guest session.
-   Một map café.
-   Avatar movement và collision.
-   Realtime presence.
-   Ghế và trạng thái ngồi.
-   Music/ambience/audio controls.
-   Group voice và microphone consent.
-   Reconnect.
-   UI cơ bản và onboarding.

## Phase 2 --- Beta Quality

-   Focus Mode.
-   People panel cải tiến.
-   Moderation: block/report.
-   Ambient NPC tối giản.
-   Tối ưu hiệu năng.
-   Dashboard metrics.
-   Kiểm thử tải và bảo mật.

## Phase 3 --- Retention & Expansion

-   Pomodoro.
-   Avatar customization.
-   Nhiều playlist và bối cảnh thời tiết.
-   Nhiều layout café.
-   Nhóm riêng/quick invite.
-   Mobile experience cải tiến.

------------------------------------------------------------------------

# 19. Rủi ro và quyết định cần xác nhận

  -----------------------------------------------------------------------
  Rủi ro                  Tác động                Hướng xử lý
  ----------------------- ----------------------- -----------------------
  Voice phức tạp và tốn   Cao                     Prototype SFU sớm, giới
  chi phí                                         hạn voice theo group

  Map isometric khó       Trung bình-cao          Chốt tile/pivot/layer
  sorting                                         rule trong Phase 0

  Café vắng người         Cao                     Ambient sound và NPC
                                                  minh bạch

  Âm thanh gây mệt        Cao                     Volume độc lập, mặc
                                                  định dễ chịu, Focus
                                                  Mode

  Người lạ nghe nhầm      Rất cao                 Voice group riêng tư,
  voice riêng                                     không phát voice rõ cho
                                                  toàn quán

  Asset không đồng nhất   Trung bình              Art bible, asset
                                                  checklist và review
                                                  pipeline

  Chi phí vận hành        Cao                     Instance capacity,
  realtime                                        autoscaling và theo dõi
                                                  participant-minute

  Người dùng không biết   Trung bình              Onboarding ngắn và
  bắt đầu                                         interaction prompt
  -----------------------------------------------------------------------

## Các quyết định còn mở

1.  Engine render chính thức: Phaser 3 hay giải pháp khác.
2.  SFU voice chính thức: LiveKit hay lựa chọn khác.
3.  Guest-only MVP hay guest + account.
4.  Có cần mã mời nhóm ngay từ MVP không.
5.  Số người mục tiêu/instance sau load test.
6.  Phong cách art cuối cùng: pixel-art/isometric hay illustrated 2.5D.
7.  Bối cảnh thời tiết có mặt trong MVP hay chỉ là asset/phase sau.
8.  Chính sách lưu profile và retention dữ liệu.

Không coi các giả định kỹ thuật hoặc con số capacity trong tài liệu này
là quyết định bất biến; cần xác nhận bằng prototype và load test.

------------------------------------------------------------------------

# 20. Definition of Done cho MVP

MVP được xem là sẵn sàng beta khi: - Người dùng có thể vào quán và bắt
đầu làm việc trong thời gian ngắn. - Map isometric có chất lượng hình
ảnh nhất quán. - Di chuyển, va chạm và ghế hoạt động ổn định. - Nhiều
người cùng hiện diện trong một instance. - Một nhóm có thể ngồi cùng bàn
và trò chuyện bằng voice. - Micro có consent rõ ràng; không có voice
leakage giữa các nhóm. - Nhạc và ambience tạo được cảm giác quán cà phê,
có điều khiển độc lập. - Reconnect và cleanup hoạt động. - Có
block/report cơ bản. - Đạt bài kiểm thử tải mục tiêu ban đầu. - Có
logging, metrics, error tracking và tài liệu vận hành. - Tất cả
asset/audio có nguồn và quyền sử dụng rõ ràng.

------------------------------------------------------------------------

# Phụ lục A --- Product north star

**Virtual Café không cố gắng biến trình duyệt thành một trò chơi. Nó
biến một buổi làm việc trước màn hình thành cảm giác đang ngồi trong
quán cà phê yêu thích.**

Khi phải lựa chọn giữa một tính năng xã hội hấp dẫn và một cải tiến giúp
không gian dễ chịu, tập trung, chân thực hơn, hãy ưu tiên trải nghiệm
không gian --- trừ khi tính năng xã hội đó trực tiếp cải thiện việc làm
việc cùng đồng đội.

# Phụ lục B --- Tóm tắt phạm vi P0

1.  Một public café, 2.5D Isometric.
2.  Shared world được triển khai bằng nhiều instance.
3.  Guest entry.
4.  Avatar movement, collision và realtime presence.
5.  Seat interaction.
6.  Working/Focus status cơ bản.
7.  Background music và café ambience.
8.  Audio controls riêng biệt.
9.  Group voice có consent và phân quyền.
10. Reconnect, moderation tối thiểu, logging và metrics.
