# Headless Event Recorder & Viewer

Status: ready-for-agent

เอกสาร requirements ที่ผู้ใช้ยืนยันแล้ว ใช้เป็นข้อตกลงสำหรับ implementation โดยการยืนยันนี้ปิดงานออกแบบ requirements ไม่ใช่คำสั่งให้เริ่ม implementation ในงานนี้

## Goal

สร้าง generic developer tool สำหรับบันทึกเหตุการณ์และเปิดตรวจย้อนหลัง เริ่มใช้งานกับ ACP ของ Cloudy แต่ไม่ผูก core กับ protocol หรือ framework ใด

## Confirmed MVP scope

### Recorder SDK

- ใช้ TypeScript และรองรับ Node.js
- ผู้ใช้สร้าง Recorder โดยระบุไฟล์ JSONL ปลายทาง
- ผู้ใช้เลือกจุดเก็บข้อมูลเอง เช่น listener, middleware หรือ transport hook
- Recorder ไม่ติดตั้ง listener และไม่ตีความ protocol
- ผู้ใช้กรองข้อมูลลับก่อนเรียก Recorder; MVP ไม่มีการตรวจหา secret หรือ redaction ในตัว
- รูปแบบการใช้งานที่ยืนยันแล้ว:

```ts
const recorder = createRecorder({
  file: "./recordings/omp-session.jsonl",
});

recorder.record({
  source: "acp",
  direction: "incoming",
  payload: rawMessage,
});

await recorder.close();
```

### Input contract

- `source` เป็น string บังคับ
- `direction` เป็น string ที่ไม่บังคับและไม่จำกัดค่า
- `payload` เป็นข้อมูล JSON
- Recorder ไม่ normalize ID หรือเปลี่ยน payload

### Recording envelope และเวลา

- แต่ละบรรทัดมี schema version, sequence, timestamp เวลาจริง และเวลาที่ผ่านไปจาก event แรก
- Recorder เป็นผู้เพิ่มข้อมูล envelope
- Sequence เริ่มจาก 1 ตามลำดับการเรียก `record()` ภายใน Recorder นั้น
- เวลาสำหรับ playback ใช้นาฬิกาที่ไม่ถอยหลังเมื่อเวลาระบบเปลี่ยน
- เวลาใน payload คงเดิมและไม่ใช้แทนเวลาที่ Recorder รับ event
- Event ที่มีเวลาเท่ากันเรียงตาม sequence
- JSONL v1 ไม่มี header; หนึ่ง event ต่อบรรทัด รูปแบบ:

```json
{"version":1,"seq":1,"timestamp":"2026-11-07T10:00:00.000Z","elapsedMs":0,"source":"acp","direction":"incoming","payload":{"type":"example"}}
```

- `timestamp` เป็น UTC; `elapsedMs` เป็น milliseconds และมีทศนิยมได้
- หากไม่ส่ง `direction` ให้ละ field นี้
- ระยะเวลา recording จบที่ event สุดท้าย ไม่นับช่วงเงียบก่อน `close()` และไม่มี metadata พิเศษสำหรับเวลาปิด

### Write lifecycle

- `record()` เก็บ snapshot ทันทีและเข้าคิวเขียนไฟล์ โดยไม่ต้อง await แต่ละ event
- การแก้ object หลังเรียก `record()` ต้องไม่เปลี่ยนข้อมูลที่รับบันทึกไปแล้ว
- Payload ที่แปลงเป็น JSON ไม่ได้ต้อง throw ตอนเรียก ไม่แอบตัดข้อมูล
- `await recorder.close()` รอจนเขียนคิวครบและปิดไฟล์
- Process crash ก่อนเขียนครบอาจทำให้ท้าย recording หาย
- สร้าง parent directory ที่ขาดได้
- ปฏิเสธไฟล์ปลายทางที่มีอยู่แล้ว ไม่ overwrite หรือ append อัตโนมัติ
- จำกัดข้อมูลที่รอเขียนด้วย `maxBufferedBytes` ค่าเริ่มต้น 16 MiB และผู้เรียกปรับได้
- เมื่อคิวเต็มหรือ event เดียวใหญ่กว่าเพดาน `record()` throw และไม่รับ event นั้น; event ที่รับก่อนหน้ายังเขียนต่อได้
- เมื่อเริ่ม `close()` แล้ว `record()` ต้อง throw
- เรียก `close()` ซ้ำได้โดยรอผลการปิดครั้งเดิม
- SDK ไม่ติดตั้ง signal handler หรือดัก process exit; ผู้เรียกต้อง await การปิดเอง
- การปิดสำเร็จรับรองว่าเขียนครบและปิดไฟล์ ไม่รับประกันความทนทานต่อไฟดับ
- เปิดไฟล์ไม่ได้: `createRecorder()` throw ทันที
- Write error แบบ async แจ้งผ่าน `onError(error)` ถ้าผู้เรียกกำหนด callback
- หลัง write error หยุดรับ event ใหม่; `record()` ครั้งถัดไป throw และ `close()` reject ด้วย error นั้น แม้แจ้ง callback แล้ว
- ไม่ retry หรือทิ้ง event เงียบ ๆ
- ถ้าไม่กำหนด `onError` ผู้เรียกต้องตรวจผล `await close()` เพื่อรับรู้ write error ที่เกิดภายหลัง

### Viewer

- เปิดผ่าน command รูปแบบ `event-tape view ./recording.jsonl`
- command เปิด local web server บน loopback และเปิด browser
- เปิดไฟล์ที่ระบุ และมีปุ่มเลือกไฟล์อื่นจากเครื่อง
- ไม่อัปโหลด recording ออกภายนอก
- แสดง event timeline และ Raw JSON
- Playback มี Play/Pause, ความเร็ว 1x/2x/4x และ progress bar ที่คลิกหรือลากเพื่อ seek ได้
- ตำแหน่งและความเร็ว playback อิงเวลาที่บันทึก ไม่ใช่จำนวน event
- ไม่ข้ามช่วงเงียบอัตโนมัติ: ช่วงห่าง 10 วินาที ใช้เวลาเล่น 5 วินาทีที่ความเร็ว 2x
- Playback หมายถึงการดูข้อมูลตามเวลาใน Viewer ไม่ emit event กลับเข้าสู่ระบบ
- ขนาดเป้าหมายสำหรับ acceptance: ไม่เกิน 50 MB และ 100,000 events โดยต้องอยู่ภายในทั้งสองเงื่อนไข
- โหลด recording ให้เสร็จก่อนเริ่ม playback
- ขนาดเป้าหมายไม่ใช่ hard limit สำหรับปฏิเสธไฟล์ใหญ่กว่า แต่ยังไม่รับรองประสิทธิภาพนอกขอบเขตนี้
- รองรับเฉพาะ recording schema ของเครื่องมือนี้ ไม่ใช่ JSONL ทุกชนิด
- ถ้าบรรทัดสุดท้ายถูกตัดกลาง JSON และไม่มี newline ให้เปิดส่วนก่อนหน้าได้พร้อมคำเตือน
- บรรทัดสุดท้ายที่เป็น JSON สมบูรณ์แต่ไม่มี newline รับได้ตามปกติ
- ข้อมูลเสียกลางไฟล์, envelope ผิด หรือ schema version ไม่รองรับ: ปฏิเสธพร้อมบรรทัดและสาเหตุ
- เปิดไฟล์แล้ว playback หยุดอยู่ที่เวลา 0
- Timeline และรายการ event แสดงทั้ง recording ไม่ซ่อนเหตุการณ์อนาคต
- ขณะเล่น Raw JSON แสดง event ล่าสุดที่ playhead ผ่าน; เวลาเท่ากันใช้ sequence สูงสุด
- คลิก event แล้วหยุด playback, เลื่อน playhead ไปเวลานั้น และแสดง JSON ของ event ที่คลิกโดยตรง
- ลาก progress bar แล้วหยุด playback และ seek
- เล่นถึงท้ายแล้วหยุด ไม่ loop
- Raw JSON แสดงทั้ง envelope และ payload ของบรรทัดที่บันทึก
- ไม่มี event: แสดง empty state และปิด playback controls
- มี event เดียวหรือทุก event อยู่ที่เวลาเดียวกัน: เปิดตรวจแต่ละ event ได้ แต่ปิด Play และ seek เพราะระยะเวลาเป็นศูนย์

### Repository และ packaging

- ใช้ pnpm และ Turborepo จัดการ monorepo
- แยก Recorder SDK และ Viewer CLI เป็นคนละ package ไม่รวมเป็น package เดียว
- การใช้ SDK ไม่ต้องเริ่ม Viewer หรือ web server

## Outside MVP

- Replay Engine และ protocol-specific drivers เช่น Fake ACP Peer
- Fake LLM และ E2E automation
- การตีความ ACP และการคำนวณ session state ใน core
- การดู recording แบบ live ขณะที่ไฟล์กำลังถูกเขียน
- การ browse ทั้ง directory ผ่าน Viewer
- การรับรอง Recorder บน browser, Bun หรือ Deno

## Acceptance scenarios

รายการนี้เป็นเกณฑ์ตรวจรับจากข้อตกลงข้างต้น ไม่ใช่ผลการทดสอบที่รันแล้ว

1. Record → close → เปิดไฟล์ด้วย Viewer CLI: ข้อมูลตรงกับ snapshot ที่ส่งเข้า SDK, sequence ถูกต้อง และ Raw JSON แสดง envelope พร้อม payload
2. ส่ง event จาก source และ direction ที่ต่างกันโดยไม่มี ACP adapter; ใช้ payload เดิมโดยไม่ normalize ID
3. เล่น event ที่ห่างกัน 10 วินาทีด้วยความเร็ว 2x: ใช้เวลา playback 5 วินาที; Pause, seek, เลือก event และจบ playback ตรงตาม contract
4. Event เวลาเท่ากันยังเรียงตาม sequence และเลือกตรวจแต่ละ event ได้; ไฟล์ว่างและระยะเวลาเป็นศูนย์แสดงตามกติกา
5. เปลี่ยน object หลัง `record()` แล้วข้อมูลที่บันทึกไม่เปลี่ยน; payload ที่รับไม่ได้และคิวเต็มแจ้ง error โดยไม่ทิ้งข้อมูลเงียบ ๆ
6. ไฟล์มีอยู่แล้ว, เปิดไฟล์ไม่ได้ และ write error แสดงผลตาม error contract; close ซ้ำได้ และ record หลังเริ่ม close ถูกปฏิเสธ
7. ท้ายไฟล์ถูกตัดเปิดส่วนก่อนหน้าได้พร้อมคำเตือน; ข้อมูลเสียกลางไฟล์, envelope ผิด และ version ไม่รองรับถูกปฏิเสธพร้อมบรรทัดและสาเหตุ
8. เปิดและใช้งาน playback/seek กับ recording ภายในเป้าหมาย 50 MB และ 100,000 events โดยไม่อัปโหลดข้อมูลออกภายนอก

## Final agreement

ผู้ใช้ยืนยันความเข้าใจร่วมกันและยอมรับ spec หลังได้ข้อยุติ Q1–Q20 แล้ว ปิดรอบ requirements และใช้เอกสารนี้เป็นข้อตกลงสำหรับ implementation ได้ ยังไม่ได้เริ่ม implementation หรือรัน acceptance scenarios

## Technical agreement

ใช้ [tech-stack.md](./tech-stack.md) เป็นข้อตกลงด้านเทคนิคที่ผู้ใช้ยืนยันแล้ว รวมข้อบังคับให้ init ทุก app/package ผ่าน CLI เท่านั้น ไม่เขียน scaffold เอง
