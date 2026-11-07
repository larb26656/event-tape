# 04: Keyboard navigation ในรายการและผลค้นหา

**What to build:** ให้ผู้ใช้กด ↑/↓ เมื่อแถว event มี focus เพื่อเลือก event ก่อนหน้า/ถัดไปในรายการที่มองเห็น รวมผลค้นหา โดย cursor, playhead, inspector และ focus อัปเดตสัมพันธ์กัน และไม่รบกวนการพิมพ์ใน search

**Blocked by:** 02: Timeline sync กับ event cursor และ inspector; 03: ค้นหา event โดยไม่เปลี่ยน Playback.

**Status:** resolved

- [ ] เมื่อแถว event มี focus ปุ่ม ↑ เลือก event ก่อนหน้าและ ↓ เลือก event ถัดไปในรายการที่มองเห็นตามลำดับเวลา
- [ ] ขณะมี query การนำทางข้ามเฉพาะผลค้นหา ไม่เลือก event ที่ถูกกรองออก
- [ ] การนำทางเลือก identity ของ event จริง อัปเดต playhead ไปเวลาของ event หยุด Playback และแสดง inspector ของ event เดียวกัน
- [ ] Focus ตามแถวที่เลือกและรายการเลื่อนให้เห็นแถวนั้นได้แม้ข้าม virtual window
- [ ] กด ↑ ที่ผลแรกหรือ ↓ ที่ผลสุดท้ายคงอยู่ที่ขอบ ไม่วนไปอีกด้าน
- [ ] ไม่ดักปุ่มลูกศรเมื่อ search input หรือพื้นที่แก้ไขข้อความมี focus และไม่เปลี่ยน selection จากการแก้ไข query
- [ ] รายการว่างและ no-results state ไม่ทำให้เกิดการเลือก event ที่ไม่มีอยู่
- [ ] ตรวจผ่าน Viewer จริงทั้งรายการเต็มและผลค้นหา รวมขอบรายการ virtual scrolling และ focus ใน search input
- [ ] ยืนยันร่วมกับ Timeline scrubbing ว่า cursor และ inspector ยังคงสอดคล้องกันหลังสลับใช้ mouse และ keyboard
- [ ] อัปเดตคำแนะนำการใช้งาน keyboard โดยไม่โฆษณา shortcut ที่ไม่ได้ทำ เช่น Command-K

## Comments

ทุก ticket เป็น vertical slice ที่ต้อง demo ผ่าน Viewer จริงได้ ไม่แยก verification ไปเป็นงานท้ายโครงการ การเพิ่ม permanent tests ต้องตรวจพฤติกรรมที่ผู้ใช้สังเกตได้ ไม่ assert CSS classes, markup snapshots หรือ component forwarding

Implemented on `integration/recording-events-inspector` (`b684240`). Real Viewer smoke covered filtered and unfiltered navigation, boundaries, search focus, chronological ordering, timeline switching, and navigation across the virtual window.
