# 03: บันทึกหลายไฟล์ร่วมกันใน Recording เดียว

**What to build:** ผู้ใช้เลือกหลาย log file ผ่าน repeated `--path` หรือ Record Preset และได้ Recording เดียวที่บอกแหล่งที่มาของทุกบรรทัด แต่ละไฟล์มี cursor, decoding และ partial state ของตัวเอง ใช้ Recorder และ shutdown budget ร่วมกัน อาศัยเส้นทางใช้งานจริงจาก ticket 01 โดยไม่ต้องรอ file lifecycle ใน ticket 02 แต่ต้องรักษาพฤติกรรมนั้นเมื่อรวมงานแล้ว

**Blocked by:** 01 — บันทึก log จากไฟล์เดียวผ่าน File Input.

**Status:** ready-for-agent

- [ ] รับ `--path` ซ้ำเพื่อเลือกหลาย literal paths และรับ Record Preset option `paths` เป็น nonempty list ของ nonempty strings ไม่ขยาย glob หรือค้นหาไฟล์ใน directory
- [ ] CLI paths แทนรายการทั้งหมดจาก preset ไม่ append/merge โดยไม่ตั้งใจ และ `--from-start` ใช้ร่วมทุกไฟล์ตาม precedence เดิม ตรวจ malformed options ก่อนเริ่ม capture
- [ ] ทุก relative path อ้างอิง invocation working directory และทุก event ระบุ source path อย่างสม่ำเสมอจนแยกข้อความจากไฟล์ต่างกันได้
- [ ] แต่ละไฟล์มี read position, newline framing, incremental UTF-8 decoder และ retained partial ของตนเอง ไม่ต่อข้อความหรืออักขระข้ามไฟล์ ไฟล์ที่ยังไม่มีบรรทัดจบต้องไม่ทำให้ไฟล์อื่นหยุดบันทึก
- [ ] ใช้ shared Recorder เดียว ลำดับภายในแต่ละไฟล์ตรงกับข้อมูลที่อ่าน และ sequence รวมเป็นลำดับที่ Recorder รับ ไม่ sort ตาม timestamp ในข้อความหรืออ้างลำดับเวลาจริงข้ามไฟล์
- [ ] กติกา default EOF, from-start, ข้ามบรรทัดเดิมที่ค้าง, LF/CRLF, blank lines, raw text, strict UTF-8 และขีดจำกัด 1 MiB ทำงานแยกต่อไฟล์ตาม ticket 01 โดยไม่เปิดทางให้หนึ่งไฟล์ละเมิด limit ของตน
- [ ] readiness หมายถึง establish initial position หรือ waiting state ของทุก configured path ตามพฤติกรรมที่ส่งมอบแล้ว ไม่ประกาศพร้อมเพียงเพราะไฟล์แรกพร้อม
- [ ] เมื่อรับคำสั่งหยุด ให้จับ finite size boundary แยกต่อ attached file ตอนเริ่ม shutdown แล้วระบายทุกไฟล์ถึง boundary ของตน ส่ง valid retained partial ต่อไฟล์ ไม่ไล่ข้อมูลที่เพิ่มภายหลัง และไม่รอ missing path กลายเป็นไฟล์
- [ ] stop ของทุกไฟล์และ Recorder close ใช้ shutdown timeout ร่วมหนึ่ง budget ไม่เพิ่ม timeout เต็มจำนวนต่อไฟล์ หาก deadline หมดต้อง unsuccessful exit และ release resources ผ่าน forced stop เดิม
- [ ] fatal read/encoding/oversize error จากไฟล์ใด หรือ queue rejection/Writer failure ทำให้ทั้ง session หยุด unsuccessfully พร้อม diagnostic ที่ระบุปัญหา ไม่ปล่อยไฟล์ที่เหลือบันทึกต่อราวกับ session ยังสำเร็จ; release resources ที่เปิดแล้วเมื่อ startup บางไฟล์ล้มเหลว
- [ ] หาก ticket 02 รวมแล้ว missing/recreated/rotated/truncated state ต้องเป็นอิสระต่อ path การเปลี่ยน generation ของไฟล์หนึ่งไม่ reset cursor หรือ partial ของอีกไฟล์; การรอไฟล์หนึ่งไม่ขวางไฟล์อื่น
- [ ] เพิ่ม CLI integration tests สำหรับหลายไฟล์ที่ append สลับกัน มี partial และ split UTF-8 คนละไฟล์ ตรวจข้อความและ path จริง พร้อม invariant ลำดับในไฟล์ โดยไม่กำหนดลำดับข้ามไฟล์ที่ขึ้นกับ scheduling
- [ ] ทดสอบ preset list replacement, global from-start, shutdown ที่มีทั้ง complete/partial lines หลายไฟล์, continuing writes หลัง stop boundary และ fatal error จากไฟล์หนึ่งที่ยุติทั้ง session ใช้ Recorder injection เดิมเฉพาะ failure ที่ต้องควบคุมอย่าง deterministic
- [ ] เมื่อรวมกับ ticket 02 ให้มี integration coverage ของไฟล์หนึ่ง rotate หรือ missing ขณะที่อีกไฟล์ยัง append ได้ โดยเพิ่มกรณีนี้ใน ticket ที่รวมเข้ามาทีหลัง ไม่สร้าง blocker เทียมระหว่างสอง ticket
- [ ] ทำ CLI smoke จริงกับหลายไฟล์ หยุด แล้วตรวจ parsed Recording พร้อม path attribution และ partial; รักษา single-file, HTTP และ lifecycle coverage ที่มีอยู่
- [ ] อัปเดตเอกสาร repeated paths, preset list override, shutdown ร่วม, shared failure และลำดับ Recorder acceptance โดยไม่อ้าง total occurrence-time order หรือ lossless capture ข้ามไฟล์
