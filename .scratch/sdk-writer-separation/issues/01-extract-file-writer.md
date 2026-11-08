# 01: แยก File Writer โดยการบันทึกไฟล์เดิมยังทำงานครบ

**What to build:** ผู้ใช้ยังสร้าง Recorder ด้วย file configuration และบันทึก Recording ได้เหมือนเดิม แต่การแปลง JSONL และจัดการ filesystem อยู่ใน File Writer ที่เรียกใช้ผ่าน public interface ได้ แยกความรับผิดชอบภายใน SDK โดยไม่เปลี่ยน schema หรือแตก package

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] มี Writer interface ที่รับ structured Recording event พร้อม metadata ผ่าน write(event) และมี close(); ทั้งสองรองรับการคืน void หรือ Promise ของ void โดย schema ยังเป็นของ recording-format
- [ ] เปิดเผย createFileWriter และ Writer ผ่าน package entry point พร้อมคง createRecorder และ public Recorder types; entry point มีเฉพาะ public exports
- [ ] createRecorder แบบ file configuration ใช้ File Writer โดย Recorder ยังคงรับผิดชอบ snapshot, metadata, คิว, byte accounting และ lifecycle ไม่ย้ายสิ่งเหล่านี้เข้า File Writer
- [ ] createFileWriter รับ file configuration สร้าง parent directories และเปิดไฟล์แบบ exclusive synchronously; open failure throw ทันทีและไฟล์เดิมไม่ถูกแก้ไข
- [ ] File Writer แปลง event เป็น v1 JSONL พร้อม newline และเขียน partial writes ให้ครบก่อน resolve รวมทั้งรายงาน write failure และปิด file handle ได้
- [ ] การใช้งาน Recorder แบบเดิมยังคง snapshot และ validation แบบ synchronous, sequence และ timing ของ event ที่ยอมรับ, ลำดับการเขียน, maxBufferedBytes, error callback และ close contract ตาม spec
- [ ] แยก File Writer tests ผ่าน public interface โดยใช้ temporary files และ controlled filesystem writes ตามรูปแบบเดิม ครอบคลุม JSONL output, parent-directory creation, exclusive creation, open errors, partial writes, write errors และ shutdown; ไม่ทดสอบ private helpers หรือ source layout
- [ ] Smoke ผ่าน default file configuration: บันทึก event ต่างกัน แก้ payload ต้นฉบับหลัง record รอ close แล้วใช้ shared parser ตรวจ snapshot, metadata, ลำดับ และ optional direction
- [ ] อัปเดตเอกสารการใช้งานและ maintenance ที่เกี่ยวกับ File Writer และ module responsibilities โดยไม่ประกาศว่า custom Writer injection พร้อมใช้ก่อน ticket 02
- [ ] SDK tests, typecheck, lint และ build ผ่าน; ทดลอง public File Writer และ default Recorder จาก packed SDK ใน external Node.js ESM consumer ไม่ใช่ import source โดยตรง

## Comments

- อ้างอิง parent spec ของ SDK Recorder / Writer Separation ใน feature directory เดียวกัน โดยเฉพาะ Implementation Decisions และ Testing Decisions

Implemented on `integration/sdk-writer-separation` (`6038ee6`). SDK tests (13 tests) and typecheck passed; no merge conflicts.
- Ticket นี้จบได้เองโดยยังไม่เพิ่ม custom Writer configuration; ticket 02 เพิ่มทางเลือกนั้นบน interface ที่แยกแล้ว

Final integrated SDK tests, typecheck, lint, build, and packed external Node.js ESM verification passed on `integration/sdk-writer-separation` (`f4b0e47`).
