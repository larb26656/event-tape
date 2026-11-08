# CLI record → view integration test

## ขอบเขตที่ยืนยัน

- ทดสอบ workflow ผู้ใช้ผ่าน CLI bundle ที่ build จาก repo โดย spawn child process จริง
- ส่ง HTTP เข้า Handler ของ `record http`; ไม่เรียก Recorder SDK แทน CLI และไม่ mock Handler, Recorder หรือ Writer
- ใช้ output เริ่มต้นใต้ `.tape` แล้วเปิด Recording เดียวกันด้วย `view`
- ตรวจ `view` ระดับ CLI/server ผ่าน HTTP; ไม่รวม browser automation หรือการ render/playback ใน Player
- ผู้ใช้อนุมัติให้ implement ตามแบบนี้แล้ว

## ตำแหน่งและรูปแบบ

เพิ่มหนึ่ง workflow scenario ใน `packages/cli/src/cli.test.ts` ซึ่งทดสอบ executable อยู่แล้ว ไม่ทำซ้ำ HTTP capture/proxy matrix ในชุดทดสอบ Handler ใช้ Vitest และแนวทาง spawn CLI/temporary directory ตาม repo เดิม โดยคำสั่ง test ของ CLI build bundle ก่อนรันอยู่แล้ว

## Scenario: บันทึก HTTP แล้วเปิด Recording ผ่าน view

1. สร้าง temporary working directory แยกสำหรับ scenario
2. รัน `node <absolute-cli-bundle> record http` โดยไม่ระบุ `--output`, host หรือ port
3. สะสม stdout ข้าม chunk และรอทั้ง `Listening:` กับ `Recording:` พร้อมตรวจ child error/exit ระหว่างรอ ใช้ address และ absolute output path ที่ CLI ประกาศ
4. ตรวจว่า output path อยู่ภายใต้ `.tape` ของ working directory และเป็นไฟล์ `.jsonl` ไม่ผูก assertion กับ timestamp หรือ random word ของชื่อไฟล์
5. ส่ง POST สองครั้งตามลำดับ รอ response แรกก่อนส่งครั้งถัดไป แต่ละ request มี URL และ JSON body ที่แยกแยะได้ด้วย ID คงที่ และมีข้อความไทย กำหนด `Content-Type: application/json` ทั้งสอง response ต้องเป็น 204
6. ส่ง SIGINT ให้ record และรอ exit code 0 โดยไม่มี terminating signal ก่อนอ่าน Recording
7. อ่านไฟล์จริง ตรวจ newline ปิดท้าย แล้วเรียก `parseRecordingJsonl` จาก `@event-tape/recording-format`
8. ตรวจว่า parser ไม่มี warning และมีสอง event เท่านั้น โดย:
   - `seq` เป็น `[1, 2]`
   - `source` เป็น `http` และ `direction` เป็น `request`
   - payload มี `kind: request`, method และ URL ตรงกับ request แต่ละรายการ
   - body เป็น UTF-8 และข้อมูลตรงกับ body ที่ส่ง รวมข้อความไทย ไม่มี truncation หรือ incomplete body
   - ID ใน body ตรงตามลำดับ input จึงตรวจได้ทั้ง event หาย ซ้ำ หรือสลับลำดับ
9. รัน `node <absolute-cli-bundle> view <announced-recording-path> --no-browser` ใน child process ใหม่
10. สะสม stdout และรอ URL ของ `Event Tape Player:` โดยตรวจ early error/exit เช่นเดียวกับ record
11. ขอ HTTP จาก URL ที่ประกาศ และตรวจ:
    - หน้า `/` เป็น Player HTML ที่โหลดได้
    - JavaScript asset ที่ HTML อ้างถึงตอบสำเร็จ โดยไม่ pin hashed filename
    - `/recording-metadata.json` ตอบสำเร็จและมี `name` ตรงกับ basename ของ Recording
    - `/recording.jsonl` ตอบสำเร็จและมีเนื้อหาตรงกับไฟล์ที่อ่านหลัง record ปิดทุก byte
    - shared parser อ่าน response Recording ได้โดยไม่มี warning และได้สอง event เดียวกับที่ตรวจจากไฟล์
12. ปิด view และรอ child process จบก่อนลบ temporary directory

## Harness และ failure diagnostics

- จำกัดเวลารอ readiness, HTTP requests และ process shutdown ทุกช่วง ไม่ใช้ fixed sleep และไม่จอง port ล่วงหน้า
- เก็บ exit/close observation ตั้งแต่ spawn เพื่อไม่พลาด process ที่จบเร็ว
- เมื่อผิดพลาด แนบ command/phase, exit status และ stdout/stderr ที่สะสมไว้
- cleanup ใน `finally`: terminate และรอ child process ทุกตัว; หากไม่ยอมปิดภายในเวลาที่กำหนด ให้ force-kill และรอจบ จากนั้นลบ temporary directory
- fail หาก process ตายก่อนทำขั้นตอนของมันครบ ไม่ถือว่า cleanup kill คือ graceful record shutdown
- ไม่เปิด browser จริงและไม่พึ่ง upstream หรือบริการภายนอก

## ขอบเขตความหมาย

HTTP body คือข้อมูลต้นทางที่ Handler แปลงเป็น event ไม่ใช่ event envelope ที่ผู้ส่งกำหนดเอง `204` หมายถึง Recorder ยอมรับ event ไม่ใช่การ flush หรือรับประกัน durability จึงตรวจไฟล์หลัง record shutdown สำเร็จเท่านั้น การอ่านไฟล์ผ่าน parser และ view server ไม่พิสูจน์การ render หรือ interaction ของ Player

## ไม่รวม

- proxy, concurrency/load, failure matrix, SIGTERM parity และ HTTP body/header edge cases ที่อยู่นอก workflow นี้
- npm pack/install, binary installation หรือการเปิด browser ของ OS
- browser E2E, timeline, playback และ UI interactions
- การเปลี่ยน domain model หรือ ADR: ใช้ Handler, Recorder, Recording และ Player ตาม `GLOSSARY.md` เดิม

## สถานะ

Scenario อยู่ใน `packages/cli/src/cli.test.ts`; ทดสอบ CLI bundle, Recording จริง และ view server โดยไม่เปลี่ยน runtime behavior
