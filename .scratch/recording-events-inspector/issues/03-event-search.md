# 03: ค้นหา event โดยไม่เปลี่ยน Playback

**What to build:** เพิ่มช่อง search ใน pane รายการของ Inspector split เพื่อค้นหาข้อความใน JSON ของ event ทั้งก้อนแบบไม่แยกตัวพิมพ์เล็ก/ใหญ่ กรองเฉพาะรายการโดยไม่เปลี่ยน Recording, Timeline, Playback position หรือ event ที่กำลังตรวจ

**Blocked by:** 01: Inspector split สำหรับ Recording จริง.

**Status:** resolved

- [ ] ค้นแบบ substring จาก JSON ของ event ทั้งก้อน ครอบคลุม metadata, nested payload, field names และ values โดยไม่แยกตัวพิมพ์เล็ก/ใหญ่
- [ ] Query ว่างหรือล้าง query คืนรายการทั้งหมด
- [ ] ผลค้นหารักษาลำดับเวลาและ identity ของ event เดิม เลือกผลค้นหาแล้ว inspector กับ playhead อ้างถึง event จริง ไม่ใช่ index ภายในผลกรอง
- [ ] เปลี่ยน query ไม่ seek, pause, resume หรือเปลี่ยน event ที่กำลังตรวจ
- [ ] Timeline และขอบเขตเวลายังคงแสดง Recording ทั้งชุด ไม่ใช่เฉพาะผลค้นหา
- [ ] เมื่อ event ที่เลือกไม่ตรง query ให้คง playhead และ inspector เดิม โดยไม่มีแถวอื่นถูกไฮไลต์แทน
- [ ] เมื่อล้างหรือเปลี่ยน query จน event เดิมกลับมาอยู่ในรายการ ให้แสดง highlight ของ event เดิมอย่างถูกต้อง
- [ ] แสดง no-results state แยกจากกรณี Recording ว่าง
- [ ] รักษา virtualization และยืนยันว่าใช้งาน search กับ Recording ขนาดใหญ่ได้
- [ ] ตรวจผ่าน Viewer จริงด้วย nested-payload query, mixed-case query, no matches และการกรอง event ที่เลือกออก พร้อมยืนยันว่า Playback และ Timeline ไม่เปลี่ยน
- [ ] อัปเดตเอกสารให้ชัดว่า search กรองเฉพาะรายการ ไม่รองรับ regex, structured queries หรือ saved searches

## Comments

ไม่ขึ้นกับ ticket 02: ใช้การเลือก event เดิมของ Viewer เพื่อส่งมอบและตรวจ search ได้โดยอิสระ เสนอหน้า Viewer จริงเป็น test seam หลักตาม spec; seam นี้ยังไม่ได้รับการยืนยันแยกจากผู้ใช้ ไม่เพิ่ม framework ทดสอบใหม่โดยปริยาย

Implemented on `integration/recording-events-inspector` (`afbd8b4`). Real Viewer smoke covered mixed-case nested search, no results, preserved inspection and playback, and virtualized search on 100,000 events. The Viewer and existing Playback store were approved as test seams.
