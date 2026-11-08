# 02: ตาม log ต่อเมื่อไฟล์เกิดใหม่ หายไป rotate หรือ truncate

**What to build:** ผู้ใช้เริ่ม Recording ก่อน log file เกิดขึ้นได้ และติดตาม log ตาม path ต่อเมื่อไฟล์หาย กลับมา ถูกแทนที่ หรือถูก truncate โดยไม่ต้องเริ่ม session ใหม่ ข้อความจากคนละ generation ไม่ถูกนำมาต่อกัน ใช้ File Input, framing, limits และ failure lifecycle จาก ticket 01 และรักษาการรองรับหลาย path หาก ticket 03 ถูกนำเข้ามาแล้ว

**Blocked by:** 01 — บันทึก log จากไฟล์เดียวผ่าน File Input.

**Status:** resolved

- [ ] path ที่ยังไม่มีตอนเริ่มเป็น waiting state ไม่ใช่ fatal error; ประกาศ readiness ได้เมื่อ establish waiting state แล้ว และไม่ต้องรอไฟล์เกิดเพื่อให้ session เริ่มสำเร็จ
- [ ] ไฟล์ที่เกิดหลังจากสังเกตว่า path ยังไม่มีให้อ่านตั้งแต่ byte zero เสมอ ไม่ขึ้นกับ `--from-start`; กติกาเริ่ม EOF ใช้เฉพาะไฟล์ที่มีอยู่ตอน initial attachment
- [ ] ติดตาม configured path ไม่ตาม renamed file ไปตลอด เมื่อพบ replacement หรือการกลับมาของไฟล์ ให้อ่าน generation ใหม่ตั้งแต่ต้น และไม่อ่าน generation เดิม/ใหม่ซ้ำจาก callback ที่ทับซ้อนกัน
- [ ] เมื่อตรวจพบ truncation ให้เริ่มอ่านจากต้นไฟล์อีกครั้ง ไม่ใช้ cursor ที่เลย EOF ต่อไป
- [ ] ก่อน reset generation เมื่อ replacement หรือ truncation ให้ส่งข้อความค้างที่อ่านเก็บไว้และเป็น UTF-8 ถูกต้องด้วย `partial: true` ไม่ต่อ byte หรือ decoder state ข้าม generation และไม่สร้าง empty partial ที่ไม่มีข้อความ
- [ ] incomplete UTF-8 ที่ final generation boundary เป็น explicit failure ตาม ticket 01 ไม่แทน byte เสียหรือเอา byte จากไฟล์ใหม่มาต่อให้ครบ
- [ ] การหายของไฟล์ชั่วคราวกลับเป็น waiting state ได้ แต่ directory, permission error และ genuine read failure ยังคง fatal ไม่ถูกแปลงเป็นการรอเงียบ ๆ
- [ ] เมื่อหยุด ให้เลิกรอ discovery และ generation ใหม่ทันที path ที่ยัง missing ไม่ทำให้ shutdown ค้าง; attached generation ระบายตาม finite boundary ที่จับไว้ และใช้ shutdown timeout ร่วมเดิม
- [ ] คืน resources ของ generation เก่าและ waiting mechanism เมื่อ stop, fatal failure หรือ forced stop โดยไม่ปิด Recorder เอง
- [ ] เพิ่ม CLI integration tests ที่สร้างไฟล์หลัง readiness, rename-and-replace, remove-and-recreate และ truncate แบบที่สังเกตได้จริง ตรวจเนื้อหา, path, partial separation และลำดับภายในแต่ละไฟล์ ไม่ assert แค่จำนวน event หรือชนิด filesystem API ที่ถูกเรียก
- [ ] ครอบคลุมบรรทัดค้างก่อนเปลี่ยน generation, ไฟล์ใหม่ที่มีข้อมูลทันที, shutdown ขณะ waiting และ shutdown ขณะเปลี่ยน generation ด้วย isolated fixtures และ bounded waits ไม่อ้างว่าทดสอบพิสูจน์การอ่าน byte ที่ถูกลบไปก่อนอ่านทัน
- [ ] ทำ CLI smoke จริงที่ append, replace ไฟล์ แล้วหยุดและตรวจ parsed Recording; รักษา tests เดิมของ single-file capture และหลายไฟล์หากมีแล้ว
- [ ] อัปเดตเอกสาร rotation/truncation และขอบเขต best-effort: rapid rotation หรือ truncate-and-regrow อาจทำให้ข้อมูลหายก่อน Input อ่านหรือสังเกตทัน ไม่รับประกัน audit หรือ recovery ของข้อมูลที่หายไป แต่ห้ามซ่อนข้อผิดพลาดที่สังเกตได้

## Comments

Implemented on `file-input-integration` in commit `39bca8d`, merged with multi-file support in `ea89cb7`.
