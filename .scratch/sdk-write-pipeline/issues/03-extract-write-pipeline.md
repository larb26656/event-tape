# 03: ย้ายคิวและ lifecycle เข้า WritePipeline<T> แบบครบเส้นทาง

**What to build:** Recorder ทั้งแบบไฟล์และ custom Writer ใช้ Pipeline ภายในจริงสำหรับคิว buffer และ shutdown โดยผู้ใช้ยังเรียก public interfaces เดิมและได้รับ ordering, fail-stop, cleanup และ reentrancy behavior ที่ตกลงไว้ครบ มี tests แยกตามเจ้าของพฤติกรรมพร้อมตรวจ SDK ที่ประกอบและแพ็กแล้วจริง

**Blocked by:** 02 — ป้องกัน reentrancy ระหว่างรับ event.

**Status:** resolved

- [ ] ใช้ parent spec “SDK Recorder / WritePipeline / Writer Refactor” และ reentrancy regressions ที่ผ่านแล้วจาก ticket 02 เป็น contract งานนี้ต้องเป็น clean cutover ที่ใช้งานครบ ไม่ทิ้ง Pipeline ที่ไม่มี caller หรือ implementation ซ้ำเพื่อรอ follow-up
- [ ] คง public Recorder, input/options, Writer และ File Writer configuration interfaces รวมทั้ง exports และ Recording schema เดิม เลือก file หรือ custom Writer ตอนสร้างเพียงอย่างเดียว และปฏิเสธ configuration ผิดก่อนเปิดทรัพยากร
- [ ] Recorder เหลือ validation, synchronous detached snapshot, envelope, sequence/timing และ canonical byte-cost calculation; File Writer ยังคงรับ structured event และทำ destination serialization, I/O และ cleanup เอง
- [ ] Pipeline เป็น generic module ภายใน ไม่ผูกกับ RecordingEnvelope, JSONL หรือ filesystem และไม่ export ผ่าน package interface รับ destination ที่มี write/close แบบ void-or-Promise พร้อม maxBufferedBytes และ optional onError
- [ ] ใช้ internal interface ที่ตกลง: assertAccepting สำหรับ early admission, enqueue ที่รับ item กับ numeric accountedBytes และตรวจ admission/capacity ซ้ำแบบ synchronous, และ close ไม่เพิ่ม flush, exposed state, readiness flags หรือ test-only getters
- [ ] enqueue สำเร็จเป็น acceptance point และ Recorder commit sequence/time origin หลังจากนั้นเท่านั้น คง early error precedence และ guard ระหว่าง preparation พร้อมย้าย final admission responsibility เข้า enqueue โดยไม่ทิ้ง lifecycle state ที่ซ้ำกันใน Recorder
- [ ] ใช้ Promise-tail FIFO เดิมเป็นแนวทางเริ่มต้น ไม่เพิ่มคิวอีกชุดหรือ scheduler framework ไม่เรียก Writer/caller callback inline จาก enqueue และมี active write ได้ไม่เกินหนึ่งรายการตาม acceptance order
- [ ] คง maxBufferedBytes ค่า default 16 MiB Recorder คำนวณ canonical v1 JSONL UTF-8 bytes รวม newline แม้ custom Writer ใช้ format อื่น Pipeline เป็นเจ้าของ aggregate ledger เพียงแห่งเดียว
- [ ] เก็บ envelope และ numeric charge โดยไม่ retain serialized string/Buffer สำเนาเพิ่ม คิดรวม queued และ in-flight รับได้ที่ exact limit และ overflow ปฏิเสธเฉพาะ event ใหม่โดยไม่กิน metadata state หรือ latch failure
- [ ] คืน charge ของแต่ละ event เพียงครั้งเดียวหลัง write settle หรือเมื่อข้ามหลัง Writer failure ไม่คืนตอน dequeue/เริ่ม write ไม่อ้างว่า budget นี้จำกัด heap, temporary allocations, Writer buffers หรือ actual destination output
- [ ] Writer.write ที่ throw หรือ reject ต้อง latch failure แรกก่อน callback คง normalization ของ non-Error write failure แจ้ง onError ครั้งเดียว ไม่ await callback และไม่ให้ callback exception แทน error หลัก
- [ ] หลัง Writer failure หยุด dispatch งานถัดไป ปฏิเสธ record ภายหลังด้วย failure เดิม ข้ามงานที่ค้างพร้อม release accounting และยังเดินทางถึง cleanup ไม่มี retry หรือ silent resume; validation/sizing/overflow/preparation errors ไม่เข้าสู่ fail-stop
- [ ] Pipeline เป็นผู้ประสาน drain และเรียก Writer.close เพียงครั้งเดียว Recorder delegate public close โดยหยุด admission ทันที รอ accepted work และปิด Writer แม้ write ล้มเหลว
- [ ] close ทุกครั้งคืน Promise object เดิมทั้งระดับ Recorder และ Pipeline รวมเมื่อสำเร็จหรือล้มเหลวแล้ว ระวัง async wrappers ที่เปลี่ยน identity
- [ ] ถ้า write และ cleanup ล้มเหลวทั้งคู่ให้ write failure แรกเป็น authoritative; ถ้ามีเฉพาะ cleanup failure ให้ preserve reason แม้เป็น undefined ไม่สับสนกับกรณีไม่มี failure
- [ ] คง Writer.write/close contract เดิม: write settlement เป็นจุดปล่อย Pipeline accounting ส่วน buffer ที่ Writer เก็บต่อเป็นของ Writer และต้องทำให้จบหรือรายงาน failure ระหว่าง close; ไม่รับประกัน crash/power-loss durability และไม่เพิ่ม flush/batching/retries/timers
- [ ] ย้าย ordering, generic capacity และ failure/lifecycle matrices ไปทดสอบ Pipeline ผ่าน internal module interface ด้วย plain generic items, explicit byte charges และ controlled Writers โดยไม่ใช้ JSONL หรือ private queue/counters เป็น test oracle
- [ ] Pipeline tests ครอบคลุม deferred dispatch, FIFO/no overlap, callback enqueue, exact/over capacity, in-flight charge, recovery, sync/async write failure, queued suppression, single/throwing onError, immediate admission stop, drain-before-cleanup, exactly-once cleanup, Promise identity และ failure precedence รวม undefined cleanup reason
- [ ] Recorder tests ใช้ Pipeline จริง ไม่ mock เพื่อ assert forwarding; คง snapshot/metadata, accepted-event sequence/time origin, canonical UTF-8/newline policy, destination selection และ selected cross-layer regressions ของ overflow, error precedence, getter-close, nested preparation และ safe Writer-callback recording
- [ ] คง File Writer suite และ automated real-file integration smoke ที่มีอยู่ ไม่ duplicate matrices ข้ามชั้น ไม่ pin source layout, incidental wording หรือ private helpers และไม่เพิ่ม shared test framework/dependency โดยไม่จำเป็น
- [ ] ลบ queue/accounting/failure/shutdown implementation เดิมที่ obsolete จาก Recorder หลังย้าย caller ครบ ไม่ทิ้ง aliases, shims, dead helpers หรือ comments ที่อธิบาย ownership เดิม
- [ ] ปรับเอกสารความรับผิดชอบ ownership, acceptance, logical buffering, reentrancy, failure/close และ Writer dependency rules ให้ตรง implementation โดยยืนยันว่าข้อตกลงสาม module seams แทนข้อจำกัดสอง seams ใน spec เดิม ไม่แก้ domain glossary ให้กลายเป็น implementation spec
- [ ] SDK tests, typecheck, lint และ build ผ่าน พร้อมรัน real-file record → close → parse smoke ของ changed path และตรวจ snapshot, metadata/order และ optional direction จาก output จริง
- [ ] สร้าง packed SDK และทดลองใน external Node.js ESM consumer ทั้ง default file configuration และ custom Writer ผ่าน public exports ตรวจผลจริงโดยไม่พึ่ง source imports หรือเพิ่ม export-forwarding unit tests รายงานเฉพาะ verification ที่รันแล้ว

## Answer

Extracted the internal generic `WritePipeline<T>` and moved FIFO dispatch, queued-plus-in-flight accounting, failure handling, drain, and Writer cleanup out of Recorder. Recorder retains validation, snapshots, metadata, elapsed timing, canonical byte sizing, and commits metadata only after enqueue. Added Pipeline and Recorder behavior suites, retained File Writer coverage and the real-file integration smoke, and updated SDK ownership/lifecycle documentation. Removed the duplicate package-entry Recorder test and added accepted-event elapsed-origin regression.

Verification: SDK tests (22 passed), typecheck, lint, build, targeted real-file parse smoke, built-SDK reentrancy smoke, and packed external ESM consumers for default file and custom Writer configurations passed. Code-review findings were fixed.
