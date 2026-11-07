# 02: Timeline sync กับ event cursor และ inspector

**What to build:** ให้ผู้ใช้ตรวจ Recording ตามเวลาโดย Timeline, cursor ที่เลือก event ในรายการ และ inspector สัมพันธ์กัน คลิก Timeline เพื่อเลือก event ใกล้เวลานั้นที่สุด ลากตัวเลื่อนเวลาเพื่ออัปเดต cursor และรายละเอียดทันทีโดย playhead ยังอยู่ที่เวลาที่ผู้ใช้กำหนด

**Blocked by:** 01: Inspector split สำหรับ Recording จริง.

**Status:** resolved

- [ ] คลิก Timeline เลือก event ที่ใกล้ตำแหน่งเวลาที่คลิกที่สุด และแสดงรายละเอียด event เดียวกับแถวที่ไฮไลต์
- [ ] ขณะลากตัวเลื่อนเวลา playhead แสดงเวลาจริงที่ผู้ใช้กำหนด ไม่ snap ไป timestamp ของ event ใกล้เคียง
- [ ] ขณะลากตัวเลื่อนเวลา cursor ในรายการและ inspector เปลี่ยนตาม event ที่ใกล้ที่สุดทันที รวมช่วงเงียบระหว่าง events
- [ ] Scrubbing หยุด Playback ตามพฤติกรรมเดิม
- [ ] คลิก event ในรายการเลือก event นั้นอย่างเจาะจง ย้าย playhead ไปเวลาของ event และหยุด Playback
- [ ] เมื่อ event ที่เลือกอยู่นอก virtual window ให้เลื่อนรายการเพื่อแสดงแถวที่เลือก โดยไม่แย่ง focus จากตัวควบคุมเวลา
- [ ] กำหนด tie policy ที่ deterministic สำหรับระยะเท่ากันและ timestamp ซ้ำ สอดคล้องกับ sequence semantics เดิม และยังเลือกแต่ละ event ที่เวลาเดียวกันผ่านรายการได้
- [ ] Empty และ zero-duration Recordings ยังคงตรวจได้ตามความสามารถเดิมโดยไม่มี selection ที่อ้างถึง event ที่ไม่มีอยู่
- [ ] ไม่เปลี่ยน automatic Playback event-at-time semantics เป็น nearest-event semantics โดยปริยาย
- [ ] ทดลองผ่าน Viewer จริงโดยลากไปเวลาระหว่างสอง events และยืนยันพร้อมกันว่า playhead คงเวลาที่ลาก cursor ชี้ event ที่ถูกต้อง และ inspector แสดง event เดียวกัน
- [ ] อัปเดต behavioral contract tests ที่ได้รับผลกระทบ โดยทดสอบผลลัพธ์ที่ผู้ใช้เห็น ไม่ผูกกับ component wiring หรือ internal indexes; บันทึกพฤติกรรมการเลื่อนเวลาในเอกสาร

## Comments

ผู้ใช้ย้ำหลังทดลอง prototype ว่าเมื่อเลื่อน Timeline ต้อง sync cursor ด้วย ตรวจพฤติกรรมจริง ไม่ใช้เพียงการพบชื่อ event ที่อยู่ในรายการอยู่แล้วเป็นหลักฐานว่า selection เปลี่ยน

Implemented on `integration/recording-events-inspector` (`3765b0b`), with review fixes in `4182a86`. A real 100,000-event Recording verified quiet-interval seeking, nearest-event inspection, virtual scrolling, and retained slider focus.
