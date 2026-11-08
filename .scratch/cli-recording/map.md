# แยก Player/CLI และเพิ่มการรับบันทึกผ่าน CLI

Labels: wayfinder:map

## Destination

แผน requirement และการตัดสินใจที่ชัดพอสำหรับส่งต่อไปเขียน spec/วางแผน implementation: แยก Player กับ CLI เป็นคนละแพ็กเกจ และเพิ่ม record แบบรับข้อมูลตรงกับ proxy โดยไม่มีคำถามตัดสินใจค้างก่อนเริ่มงาน

## Notes

- Planning only: ไม่ implement ระหว่าง charting; ทำ decision ticket ครั้งละหนึ่งเรื่องต่อ session
- ทุก session อ่าน grilling และ domain-modeling; ใช้คำตาม GLOSSARY.md
- ผู้ใช้ยืนยันระหว่าง charting: Player เป็น UI; CLI เป็นเจ้าของ view/record; ติดตั้ง CLI ครั้งเดียวแล้วยังเปิด Player ได้
- ขารับไม่ผูก schema แอป และเพิ่ม handler ภายหลังได้; รายละเอียดและตัวอย่างแหล่งข้อมูลที่ไม่ใช่ network อยู่ใน [สัญญาระหว่าง Handler กับ Recorder](issues/03-handler-contract.md#comments)
- Proxy ส่งต่อพร้อมบันทึกสองทิศทาง ไม่ตั้งใจแก้เนื้อหาหรือจำลอง response
- เป้าหมาย local/dev; บันทึกเป็น Recording สำหรับเปิดดูภายหลัง
- ช่วงแรก focus HTTP request; ขอบเขต protocol อยู่ใน [ช่องทางรับข้อมูลและ protocol ชุดแรก](issues/02-initial-handlers.md#comments); ยังไม่รับปาก public plugin API
- Record Preset แยกจากโค้ด Handler และผู้ใช้เขียนเป็นไฟล์ declarative ได้; ข้อตกลงและคำถามที่เหลืออยู่ใน [รูปแบบ declarative Record Preset และลำดับการตั้งค่า](issues/06-record-presets.md)
- เปลี่ยนข้อกำหนด package เดียวของ [Separate Viewer UI and CLI responsibilities](../ui-cli-separation/spec.md) โดยตั้งใจ; spec เก่านั้นเป็นประวัติ ไม่ใช่ข้อห้ามของ effort นี้
- Tracker: child issues ใน issues/; ไม่มี Status หมายถึง open/unclaimed; claim ด้วย Status: claimed ก่อนทำงาน และ resolve ด้วย Answer กับ Status: resolved ตาม docs/agents/issue-tracker.md

## Decisions so far

- [ขอบเขตแพ็กเกจและการติดตั้ง CLI กับ Player](issues/01-package-boundaries.md#answer): CLI เป็นเจ้าของคำสั่งและ server; ใช้ built Player assets ผ่าน dependency เวอร์ชันแน่นอน ติดตั้งครั้งเดียวและเปิดดู offline ได้

## Not yet specified

<!-- หมอกสองพื้นที่เดิมถูกทำให้เป็นข้อกำหนดที่ระบุได้แล้ว: ขอบเขตข้อมูล/streaming อยู่ใน tickets ของ Handler/Proxy, การรับไม่ทันอยู่ใน Lifecycle และรูปแบบการเรียกใช้/output อยู่ใน Record Preset ไม่มี patch ที่ยังต้องแตกเป็น ticket ใหม่จากการสนทนารอบนี้ -->

## Out of scope

- เขียน implementation ใน effort นี้: ปลายทางคือแผนสำหรับส่งต่อ
- Live viewing ระหว่างบันทึก
- Public ingestion service และการรองรับหลายผู้ใช้
- แก้ไข traffic หรือจำลอง response ใน proxy
- Replay: การเปิดดูยังเป็น Playback ไม่ส่งเหตุการณ์จาก Recording กลับเข้าระบบ
