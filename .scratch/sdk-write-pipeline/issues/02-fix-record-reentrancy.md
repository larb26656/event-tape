# 02: ป้องกัน reentrancy ระหว่างรับ event

**What to build:** ผู้ใช้ Recorder ไม่พบการเขียนหลัง Writer ถูกปิดหรือ sequence ซ้ำเมื่อ getter ของ input เรียกกลับเข้า Recorder โดยแก้กับ architecture ปัจจุบันก่อนแยก Pipeline การปฏิเสธ event จาก reentrancy ไม่ทำให้ Recorder เสียถาวร และ Writer callback ยังบันทึกเพิ่มได้เมื่อเปิดรับอยู่

**Blocked by:** 01 — จัด test suites ตามพฤติกรรมก่อน refactor.

**Status:** resolved

- [ ] ใช้ parent spec “SDK Recorder / WritePipeline / Writer Refactor” เป็นข้อกำหนดร่วม และใช้ test suites ที่จัดแล้วใน ticket 01 งานนี้ยังไม่สร้าง WritePipeline
- [ ] เก็บ regression ที่พิสูจน์ failure ก่อนแก้สำหรับ payload getter ที่เรียก close ระหว่าง record และ source getter ที่เรียก record ซ้อนแล้วทำให้ sequence ซ้ำ จากนั้นยืนยันผลหลังแก้ผ่าน Recorder interface
- [ ] ตรวจ admission ก่อนอ่าน caller-controlled input เหมือนเดิม และตรวจซ้ำหลังเตรียม input/คำนวณขนาดก่อนรับ event เข้า queue หรือ commit metadata รักษาลำดับ write failure ก่อน closed state ก่อน input-validation errors
- [ ] เมื่อ getter เริ่ม close ระหว่าง preparation ให้ record ที่ยังเตรียมไม่เสร็จถูกปฏิเสธแบบ synchronous โดย event นั้นไม่ถูกส่งให้ Writer งานที่รับก่อนหน้า drain ได้ตามปกติ และไม่มี write หลัง cleanup
- [ ] ปฏิเสธ nested record ระหว่าง preparation จนถึง metadata commitment ก่อน inner call เปลี่ยน queue, sequence หรือ time origin โดย guard ต้องถูกปล่อยทุกทางออก รวมทั้ง getter/serialization errors
- [ ] การปฏิเสธ nested preparation ไม่ latch Writer failure ไม่แจ้ง onError และไม่ poison Recorder ทดสอบว่า event ปกติหลัง error ยังรับได้ด้วย sequence ต่อเนื่อง; หาก getter จับ nested error เอง outer event ที่ valid ต้องไม่สร้าง sequence ซ้ำ
- [ ] Event ที่ถูกปฏิเสธไม่กิน sequence หรือกำหนด elapsed-time origin และไม่ทำให้งานที่รับก่อนหน้าหายหรือเสีย accounting ใช้ observable metadata และ controlled inputs ไม่ตรวจ private state
- [ ] คง deferred Writer dispatch จน record จบการ commit แล้ว Writer callback สามารถ record event เพิ่มขณะยังเปิดรับได้ โดยผลลัพธ์มีลำดับและ sequence ถูกต้องและไม่มี write ซ้อน
- [ ] คง synchronous snapshot/validation, destination selection, canonical buffering, FIFO, fail-stop, close draining, exactly-once cleanup, repeated-close Promise identity และ write-over-cleanup error precedence เดิม ไม่เพิ่ม validation rules หรือขยาย public interfaces
- [ ] มี focused cross-layer regressions ใน Recorder suite และรัน Node smoke ของ getter-close, nested preparation และ Writer-callback recording โดยไม่ใช้ timers เป็นกลไก production หรือแก้ด้วยการ suppress error
- [ ] เอกสารอธิบายการปฏิเสธ nested preparation การอนุญาต Writer-callback recording และข้อห้ามที่ Writer.write/close รอ close ของ Recorder เจ้าของตัวเองเพราะเกิด circular wait ไม่เพิ่ม cycle detection หรือ timeout fallback และไม่สร้าง permanent test ที่แขวน suite
- [ ] SDK tests, typecheck, lint และ build ผ่าน พร้อม real-file record → close → parse smoke โดย regression ทั้งสองกรณีผ่านหลังแก้ รายงานเฉพาะ verification ที่รันจริง

## Answer

Added synchronous preparation guarding and a second admission check before acceptance. Getter-triggered close now rejects the unfinished event; nested preparation cannot commit duplicate metadata, while deferred Writer callbacks can still record while open. Documented the circular shutdown dependency.

Verification: SDK tests (18 passed), typecheck, lint, build, real-file integration smoke (covered by the SDK suite), and a built-SDK Node smoke for getter-close, nested preparation, and Writer-callback recording passed.
