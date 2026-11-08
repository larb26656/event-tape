# 01: จัด test suites ตามพฤติกรรมก่อน refactor

**What to build:** ผู้ดูแล SDK สามารถแยกตรวจพฤติกรรม Recorder, File Writer และการประกอบเส้นทางไฟล์จริงได้ชัดเจน โดยการใช้งานปัจจุบันยังทำงานครบเหมือนเดิม เตรียมฐาน tests ให้แก้ reentrancy และแยก Pipeline ใน tickets ถัดไปโดยไม่ย้าย tests ซ้ำหลายครั้ง

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] ใช้ parent spec “SDK Recorder / WritePipeline / Writer Refactor” เป็นข้อกำหนดร่วม งานนี้เป็น prefactor ของ tests เท่านั้น ไม่เปลี่ยน production behavior หรือ public interfaces
- [ ] ย้าย Recorder behavior tests ออกจากชุดที่ตั้งชื่อตาม package entry point ไปยังชุดที่สื่อความหมายว่าเป็น Recorder โดยยังเรียกผ่าน interface ที่ผู้ใช้ใช้งานจริงและใช้ array-backed หรือ controlled Writer
- [ ] ก่อนมี Pipeline จริง ให้ ordering, buffer และ failure/lifecycle tests เดิมอยู่กับ Recorder ชั่วคราว ห้ามสร้าง Pipeline เปล่า, stub หรือ mock-only seam เพื่อให้โครงสร้าง tests ดูครบสามชั้น
- [ ] ย้าย real-file Recorder case เดิมไปเป็น automated integration smoke ใน normal CI โดยไม่เก็บสำเนาซ้ำ ทดสอบผ่าน public file configuration และ temporary file จริง
- [ ] Integration smoke บันทึก event ต่างกัน แก้ payload ต้นฉบับหลัง record รอ close อ่านไฟล์แล้วใช้ shared parser ตรวจ snapshot, envelope metadata, sequence/order และ optional direction ไม่ใช่เพียงตรวจว่าไม่ throw หรือมีไฟล์เกิดขึ้น
- [ ] คง File Writer suite แยกอิสระ รวม real temporary files, exclusive creation, synchronous open failure, JSONL, partial writes, write errors และ cleanup ตาม coverage เดิม
- [ ] คง coverage เดิมของ snapshot, payload rejection, destination configuration, accepted-event metadata, canonical UTF-8/newline budget, capacity recovery, serialized writes, fail-stop, close identity และ error precedence โดยไม่ลดข้อกำหนดเพื่อให้ refactor ผ่าน
- [ ] Tests ไม่ผูกกับ private helpers, source layout, export forwarding, incidental wording หรือ test-only getters; จัดการ assertions ที่ผูกกับรายละเอียด implementation โดยรักษา behavioral coverage แทนการ repin รายละเอียดนั้น
- [ ] ใช้ deferred gates และ test patterns ที่มีอยู่ ไม่ใช้ sleep-based scheduling ไม่เพิ่ม dependency หรือ shared test framework โดยไม่จำเป็น และรักษาการแยก temporary resources ระหว่าง tests
- [ ] ปรับเอกสารการดูแล tests ที่เกี่ยวข้องให้ตรงกับการแยกชุดที่ทำจริง โดยไม่ประกาศว่า Pipeline หรือ reentrancy fixes ใน tickets ถัดไปเสร็จแล้ว
- [ ] SDK tests, typecheck และ lint ผ่าน พร้อมรัน real-file record → close → parse smoke จริงและรายงานผลที่สังเกตได้ ไม่มีการแก้ production code เพื่อกลบ failure จากการย้าย tests

## Answer

Moved Recorder behavior coverage to `packages/sdk/src/recorder.test.ts`, moved the real-file public-API smoke to `packages/sdk/src/integration.test.ts`, and documented suite ownership in `packages/sdk/AGENTS.md`. File Writer tests remain independent.

Verification: SDK tests (15 passed), SDK typecheck, SDK lint, and the targeted real-file integration smoke (1 passed).
