# 01: Inspector split สำหรับ Recording จริง

**What to build:** เปลี่ยน Viewer เป็นรูปแบบ C · Inspector split ที่ผู้ใช้เลือก: รายการ Recording events ด้านซ้าย, Timeline และตัวควบคุม Playback ตรงกลาง, Raw JSON inspector ด้านขวา โดยเปิด Recording จริงและใช้ความสามารถเดิมได้ ไม่ใช้ข้อมูลสังเคราะห์แทนข้อมูลจริง

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] Viewer แสดงโครงสร้าง Inspector split ตามแบบ C ที่ผู้ใช้เลือก และจัดเรียงใหม่บนจอแคบโดยเข้าถึงรายการ Timeline และรายละเอียดได้ครบ
- [ ] เปิด Recording จริงได้ และรักษาสถานะ loading, empty, error และ recovery warning เดิม
- [ ] เลือก event ในรายการแล้วแสดง envelope และ payload ที่ถูกต้องใน inspector พร้อมเลื่อน playhead ไปเวลา event และหยุด Playback ตามพฤติกรรมเดิม
- [ ] Play, pause, speed และตัวเลื่อนเวลายังใช้งานได้กับ Recording จริง
- [ ] รักษา virtualization ของรายการสำหรับ Recording ขนาดใหญ่
- [ ] เก็บ prototype ทุกแบบเป็น primary source บน throwaway branch และบันทึก branch pointer กับข้อสรุปว่าเลือก C เพราะแยกการนำทาง Timeline และรายละเอียดได้ชัดเจน ก่อนถอดโค้ดทดลองออกจาก implementation หลัก
- [ ] ไม่มี synthetic fixtures, prototype route หรือ variant switcher ปะปนใน Viewer ที่ส่งมอบจริง
- [ ] ทดลองเปิด Recording และเลือก event ผ่าน Viewer จริง พร้อมตรวจ desktop และจอแคบ; ปรับเอกสารการใช้งานให้ตรงกับ layout ใหม่

## Comments

อ้างอิง spec ของ feature Recording events inspector ใน tracker เดียวกัน ไม่เปลี่ยน Recording format, Recorder หรือความหมายของ Playback และ Replay งานนี้ไม่ต้อง prefactor แยกก่อนเริ่ม

Prototype primary source: branch `prototype/recording-events-inspector`, commit `580c7f4`. Variant C was selected because it clearly separates event navigation, Timeline, and details.

Implemented on `integration/recording-events-inspector` (`ad0cd11`). The real Viewer was exercised with the sample Recording at desktop and narrow widths; playback controls and event inspection were checked.
