# 01: บันทึก log จากไฟล์เดียวผ่าน File Input

**What to build:** ผู้ใช้บันทึกข้อความที่ append ลงไฟล์ที่มีอยู่ผ่าน File Input แล้วเปิด Recording ใน Player ได้ โดยไม่แก้โปรแกรมต้นทาง ครอบคลุมการเลือกจุดเริ่มอ่าน การตั้งค่าผ่าน Record Preset การจัดการข้อมูลผิดรูปแบบ และการหยุดอย่างมีขอบเขต เป็นเส้นทางที่ใช้งานได้จริงสำหรับไฟล์เดียว ส่วนการรอไฟล์และเปลี่ยน generation อยู่ใน ticket 02 และการเลือกหลายไฟล์อยู่ใน ticket 03 ทั้งหมดอยู่ภายใต้สเปก File Input ที่อนุมัติแล้ว

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] มี Input ชื่อ `file` ลงทะเบียนผ่าน Input contract เดิม เรียกใช้ด้วย `event-tape record file --path app.log` โดยไม่เปลี่ยนพฤติกรรม HTTP Input หรือเพิ่มรายละเอียด filesystem ใน orchestration กลาง
- [ ] สำหรับไฟล์ที่มีอยู่ เริ่มอ่านที่ EOF โดยปริยาย หรืออ่านตั้งแต่ต้นด้วย `--from-start` ไม่จำ cursor ข้าม session; relative path อ้างอิง working directory ของ invocation
- [ ] หากเริ่มที่ EOF กลางบรรทัดเดิม ให้ข้ามส่วนต่อของบรรทัดนั้นถึง newline โดยไม่สะสมข้อความที่ข้ามไว้ในหน่วยความจำ หากไฟล์เดิมลงท้ายด้วย newline ต้องไม่ข้ามบรรทัดใหม่ถัดไป
- [ ] ใช้ Record Preset แบบ declarative เดิม: options คือ `paths` และ `fromStart`; CLI override มาก่อน preset แล้วจึง defaults การระบุ CLI path แทนรายการจาก preset ตรวจชนิดและ unknown fields ก่อนเริ่ม capture โดยไม่สร้างระบบ config ใหม่ ส่วนรายการหลายไฟล์ส่งมอบใน ticket 03
- [ ] ประกาศ readiness หลังตั้ง initial read position แล้ว และแจ้ง Recording output ให้ผู้ใช้ทราบ โดยไม่กำหนดให้ Input ต้องเปิด network listener
- [ ] แต่ละบรรทัดสร้างหนึ่ง event พร้อม source path ที่ระบุอย่างสม่ำเสมอ ข้อความดิบ และ partial marker รองรับ LF/CRLF โดยไม่เก็บตัวจบบรรทัด เก็บบรรทัดว่างและ whitespace อื่น ไม่สร้าง event ว่างเกินมาหลัง terminal newline
- [ ] ไม่ parse JSON, timestamp หรือ redact ข้อความ ใช้ Recorder envelope และ sequence/timestamp/elapsed-time เดิม พร้อมเอกสาร payload ที่ชัดเจน
- [ ] อ่าน UTF-8 แบบ strict และ incremental รองรับอักขระที่แบ่งข้ามหลาย write; invalid UTF-8 ทำให้ session ล้มเหลว ไม่แทนด้วยอักขระ replacement รวมถึงลำดับ byte ที่ยังไม่ครบเมื่อถึง final boundary
- [ ] จำกัดเนื้อหาต่อบรรทัดที่ 1,048,576 bytes ไม่นับ LF/CRLF ยอมรับค่าที่เท่าขีดจำกัด และหยุดพร้อม error เมื่อเกิน แม้ไม่มี newline ไม่ส่งข้อความที่ตัดทอนมาแทน
- [ ] path ที่เป็น directory หรืออ่านไม่ได้ทำให้หยุดพร้อม error ที่ระบุ path; ไม่ซ่อน read failure, Recorder queue rejection หรือ asynchronous Writer failure และ exit unsuccessfully เมื่อเกิดข้อผิดพลาดเหล่านี้
- [ ] เมื่อรับ SIGINT/SIGTERM ให้กำหนด read boundary จากขนาดไฟล์ที่เห็นตอนเริ่มหยุด อ่านถึง boundary นั้น ไม่ตามข้อมูลที่เขียนเพิ่มภายหลัง ส่งข้อความค้างที่เป็น UTF-8 ถูกต้องด้วย `partial: true` แล้วให้ CLI ปิด Recorder ภายใน shutdown timeout เดิม
- [ ] Input คืน resources เมื่อหยุดสำเร็จ, startup ล้มเหลว, fatal failure หรือ forced stop โดยไม่ปิด shared Recorder เอง; output selection, exclusive creation และ default naming ยังคงเดิม
- [ ] เพิ่ม behavior tests ผ่าน built CLI กับ temporary file จริง ตรวจข้อความ, path, partial, parser output, exit status และ diagnostics ครอบคลุม start positions, framing, split/invalid UTF-8, size boundary และ shutdown ใช้ readiness และ bounded waits ไม่ใช้ filesystem mock เป็นหลัก
- [ ] ใช้ Recorder factory injection เดิมเพื่อทดสอบ queue rejection และ Writer failure แบบ deterministic ด้วย real Recorder ไม่ทดสอบแค่ mock forwarding
- [ ] ทำ CLI smoke จริง: append ข้อความ หยุด แล้วอ่าน Recording ด้วย parser และพิสูจน์ว่าเปิดผ่าน record-to-view flow เดิมได้ โดยไม่เพิ่ม Player parser ใหม่
- [ ] เพิ่ม permanent integration test ใน `packages/cli/src/cli.test.ts` ควบคู่ HTTP workflow: เปิด built CLI ด้วย temporary log จริง รอ readiness แล้ว append ข้อความที่ทราบค่าทั้งบรรทัดเต็มและบรรทัดค้าง ส่ง SIGINT ตรวจ exit สำเร็จและ parsed text/path/partial จากนั้นเปิดผ่าน view และตรวจว่า Recording ที่ serve มี bytes และ events ตรงกับไฟล์ที่บันทึก ไม่ใช้เพียง smoke script หรือ tests ใน Input directory แทนข้อกำหนดนี้
- [ ] อัปเดตเอกสารการใช้คำสั่ง, preset, event payload, limits, shutdown และความเสี่ยง secrets; ระบุว่าเป็น best-effort ไม่ใช่ lossless audit และไม่รองรับ glob, multiline grouping, transforms หรือ resume checkpoints

## Comments

Implemented on `file-input-integration` in commit `9e428a0`; subsequent lifecycle, multi-file, and review fixes are included on the integration branch.
