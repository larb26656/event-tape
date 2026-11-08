# CLI framework candidates สำหรับ Event Tape

ตรวจแหล่งข้อมูล: **2026-11-08** · สถานะ: **ข้อเสนอเพื่อคุยต่อ ไม่ใช่การตัดสินใจที่ผู้ใช้ยืนยัน**

ขอบเขต: เปรียบเทียบ command/options, help/errors, TypeScript/ESM, Node engines และเครื่องมือแจกจ่าย CLI กับเงื่อนไขโครงการ Node `>=22` ที่ได้รับมา ไม่ได้ติดตั้งแพ็กเกจหรือรัน build/test/benchmark

## ข้อเท็จจริงจากแหล่งปฐมภูมิ

| ตัวเลือก | Command / options / help / errors | TypeScript + ESM และ Node |
| --- | --- | --- |
| **Commander.js** | ประกาศ `.command()`, `.argument()`, `.option()` และ action; มี subcommands, required options, defaults, choices/custom parsers และ async actions; สร้าง help และแจ้ง unknown options/ค่าที่ขาดให้ มี error suggestions, `showHelpAfterError()` และ `exitOverride()` สำหรับควบคุมการจบ process [C1] | รุ่นที่ตรวจ **15.1.0** เป็น ESM (`type: module`) มี `.d.ts` และต้องการ **Node `>=22.12.0`** ไม่ใช่ `>=22.0.0` [C2] การ infer types จากคำประกาศ options/actions ที่ละเอียดขึ้นมีแพ็กเกจเสริม `@commander-js/extra-typings` ไม่ใช่ความสามารถทั้งหมดของตัว core [C1] |
| **oclif** | โมเดลหลักเป็น class สืบทอด `Command` พร้อม `run()` และ static metadata/flags/args; flags มี required/default/env, custom parsing และความสัมพันธ์ เช่น dependsOn/exclusive; มี help จาก metadata และ `this.error()` รองรับ exit code/suggestions/ref [O1][O2][O3] | generator สร้าง TypeScript CLI และเลือก ESM ได้; มีเอกสาร CJS/ESM interoperability [O4][O5] `@oclif/core` ที่ตรวจ **5.1.11** มี declarations และ engine **Node `>=22.0.0`**; นโยบายเอกสารระบุรองรับ Node LTS [O6][O4] |
| **CAC** — ตัวเลือก lightweight ที่เลือกมาวิเคราะห์ | `.command().option().action()`, default command, variadic args, aliases, negated/dot-nested options; เปิด generated help ด้วย `.help()` และ version ด้วย `.version()`; ตรวจ unknown options/required positional args/option value ที่ขาดเมื่อรัน matched action และจัดการ exception เองได้ [A1][A3] | เขียนด้วย TypeScript แต่ callback ของ `.action()` ใน source เป็น `(...args: any[]) => any` จึงไม่ควรถือว่า infer types ของ handler ให้ครบ [A1][A3] รุ่นที่ตรวจ **7.1.0** เป็น ESM และ engine **Node `>=20.19.0`**; manifest ไม่มี runtime `dependencies` และระบุ inline `mri` [A2] |
| **`node:util.parseArgs`** — baseline ไม่เพิ่ม framework | รองรับ string/boolean options, short aliases, defaults, repeatable options, positionals และ tokens; `strict: true` เป็นค่าเริ่มต้นและ throw เมื่อเจอ unknown/type ไม่ตรง; API คืน parsed data ไม่ได้มี command dispatcher หรือ generated help ในสัญญา API [N1] | ใช้ ESM `import { parseArgs } from 'node:util'` ได้; stable ตั้งแต่ Node 20 จึงใช้ได้บน Node 22; `allowNegative` เพิ่มใน **22.4.0** อย่าสมมติว่ามีใน 22.0 [N1] สำหรับ TypeScript ใช้ Node API declarations จาก `@types/node` [N2] |

**ระวังความหมาย required ของ CAC:** `--port <port>` หมายถึงถ้าระบุ option ต้องมีค่า ไม่ได้แปลว่าต้องส่ง `--port` ทุกครั้ง; source ตรวจค่าที่หายแต่ไม่ได้ reject `undefined` ในกรณีนี้ ต่างจาก Commander `.requiredOption()` หรือ oclif `required: true` [A1][A3][C1][O2]

### Completion, plugins และ packaging

- **oclif:** มี `@oclif/plugin-autocomplete` สำหรับ **bash, zsh, PowerShell** แต่ต้องเพิ่ม/ตั้งค่า plugin และให้ผู้ใช้ติดตั้ง shell integration; ไม่ใช่แค่ใช้ core แล้ว completion ทำงานทันที [O7] Plugins เพิ่ม commands/hooks ได้ และการให้ผู้ใช้ติดตั้ง plugins เองใช้ `@oclif/plugin-plugins` [O8]
- **oclif:** แจกจ่ายผ่าน npm หรือ standalone tarballs ที่รวม Node binary; เครื่องมือ release มี Windows/macOS installers และ update plugin ด้วย สิ่งเหล่านี้เป็น **การแจกจ่าย CLI** ตามเอกสาร ไม่ใช่ desktop GUI framework [O9]
- **Commander / CAC:** ใน README/API ที่ตรวจ ไม่พบระบบ runtime plugin installation, ตัวสร้าง shell completion หรือ standalone installer แบบ oclif; จึง **ไม่นับว่าเป็น built-in** และไม่สรุปว่า ecosystem ภายนอกทำไม่ได้ [C1][A1] การมี Commander stand-alone executable subcommands ไม่เท่ากับมี plugin manager [C1]
- **Commander / CAC / parseArgs:** การเผยแพร่ executable ผ่าน npm ใช้ `package.json#bin` ได้ตามกลไก npm; npm สร้าง link หรือ Windows `.cmd` ให้ จึงไม่จำเป็นต้องใช้ oclif เพียงเพื่อเผยแพร่ CLI บน npm [P1]

### เหตุผลที่เลือก CAC แทน citty ใน shortlist นี้

ทั้งสองเป็นตัวเลือกที่เข้าประเภท CLI builder; citty ระบุ nested/lazy subcommands, generated usage และมี ESM/type declarations แต่ manifest ที่ตรวจไม่ได้ประกาศ `engines.node` [T1][T2] **ข้อประเมิน:** เลือกลงรายละเอียด CAC เพราะชุด command/help พอกับโจทย์และมี engine floor ชัดเจน ไม่ใช่ข้อกล่าวหาว่า citty ใช้ Node 22 ไม่ได้ หรือดูแลแย่กว่า

## ข้อเสนอและ tradeoffs — ยังไม่ยืนยัน

1. **Default candidate: Commander.js** สำหรับ CLI ที่มีคำสั่งไม่มากและต้องการ help/errors ที่ประกาศจาก schema เดียวกันโดยไม่รับโมเดล plugins/release ทั้งชุดของ oclif ความเหมาะสมนี้เป็นการประเมินจาก API ข้างต้น ไม่ใช่ผล benchmark [C1][O8][O9]
2. **ต้องแยกตัดสินใจเรื่อง Node floor:** Commander 15.1.0 ไม่ครอบคลุมสัญญา `>=22` ทั้งช่วง ถ้าจะใช้รุ่นนี้ต้องยอมรับการขยับ minimum เป็น `>=22.12.0` ก่อน; ห้ามเปลี่ยน runtime contract เงียบ ๆ [C2] ทางเลือกที่รักษา floor เดิมคือ CAC 7.1.0 หรือ Commander **14.0.3** ซึ่งประกาศ Node `>=20` และมี ESM/type exports; แต่ 14.x อยู่ maintenance/security-only และ policy ระบุ EOL **2027-05-29** จึงไม่ใช่การ pin ระยะยาวโดยไม่มีต้นทุน [A2][C3][C4]
3. **CAC** เหมาะถ้าต้องการ API สั้นและ dependency surface เล็กตาม manifest มากกว่าความครบของ command UX; ต้องรับผิดชอบ typed handler boundaries, error presentation และ validation ที่เกิน API เอง นี่คือต้นทุนเชิงออกแบบ ไม่ใช่ข้อสรุปด้านความเร็ว [A1][A2][A3]
4. **เลือก oclif เมื่อมี requirement จริง** เช่น command tree ขนาดใหญ่ที่แยก modules/plugins, plugins ที่ผู้ใช้ติดตั้งเอง, completion หลาย shell หรือ standalone CLI installers/update distribution; ประเมินว่าจะคุ้มกับ conventions, config, dependencies และ release/plugin lifecycle ที่เพิ่มมาหรือไม่ ไม่เลือกเพียงเพราะอาจมี desktop ในอนาคต [O4][O6][O7][O8][O9] เอกสาร ESM ยังมีข้อจำกัด auto-compilation ของ linked plugins ที่ใช้ `ts-node`; ระบุทางเลือก `tsx` ไว้ จึงควรคิดถึง workflow นี้เมื่อเลือก plugin architecture [O5]
5. **`parseArgs` พอได้** ถ้าเป็น launcher คำสั่งเดียวและยอมดูแล help/dispatch/errors เอง แต่เมื่อเริ่มเขียน command registry/help generator ของตัวเอง ควรเทียบต้นทุนนั้นกับ Commander/CAC ใหม่ ไม่จำเป็นต้องสร้าง framework เอง [N1][C1][A1]
6. **เรื่อง desktop แยกอีกแกน:** ข้อเสนอเชิงสถาปัตยกรรมคือให้ CLI เป็น adapter สำหรับ argv/stdout/exit และให้ UI/desktop เรียก application capabilities ผ่านขอบเขตที่ไม่ขึ้นกับ CLI framework การแยก package/process และการเลือก desktop runtime ยังต้องคุย requirement ต่อ ไม่ได้ถูกตัดสินจาก framework shortlist นี้; installer ของ oclif ไม่ได้ตอบโจทย์นั้น [O9]

ไม่มีข้อสรุปด้าน popularity, maintenance quality หรือประสิทธิภาพจากจำนวนดาว/downloads และไม่มีการทดสอบความเข้ากันได้จริงใน repository นี้

## แหล่งข้อมูลปฐมภูมิ

- [C1] [Commander README/API](https://github.com/tj/commander.js/blob/master/Readme.md)
- [C2] [Commander published metadata — ตรวจแล้วเป็น 15.1.0](https://registry.npmjs.org/commander/latest)
- [C3] [Commander 14.0.3 published metadata](https://registry.npmjs.org/commander/14.0.3)
- [C4] [Commander release policy](https://github.com/tj/commander.js/blob/master/docs/release-policy.md)
- [O1] [oclif commands](https://oclif.io/docs/commands/)
- [O2] [oclif flags](https://oclif.io/docs/flags/)
- [O3] [oclif features — generated help](https://oclif.io/docs/features/)
- [O4] [oclif introduction/requirements](https://oclif.io/docs/introduction/)
- [O5] [oclif ESM support/caveats](https://oclif.io/docs/esm/)
- [O6] [oclif core published metadata — ตรวจแล้วเป็น 5.1.11](https://registry.npmjs.org/@oclif%2fcore/latest)
- [O7] [Official autocomplete plugin README](https://github.com/oclif/plugin-autocomplete/blob/main/README.md)
- [O8] [oclif plugins](https://oclif.io/docs/plugins/)
- [O9] [oclif releasing](https://oclif.io/docs/releasing/)
- [A1] [CAC README](https://github.com/cacjs/cac/blob/main/README.md)
- [A2] [CAC published metadata — ตรวจแล้วเป็น 7.1.0](https://registry.npmjs.org/cac/latest)
- [A3] [CAC command implementation/types/validation](https://github.com/cacjs/cac/blob/main/src/command.ts)
- [N1] [Node 22 `util.parseArgs`](https://nodejs.org/docs/latest-v22.x/api/util.html#utilparseargsconfig)
- [N2] [Node TypeScript type definitions guidance](https://nodejs.org/en/learn/typescript/introduction#type-definitions)
- [P1] [npm `package.json#bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin)
- [T1] [citty official README](https://github.com/unjs/citty/blob/main/README.md)
- [T2] [citty source manifest — ตรวจแล้วเป็น 0.2.2](https://github.com/unjs/citty/blob/main/package.json)

หมายเหตุ: `latest`/branch URLs และเอกสารเว็บเปลี่ยนได้; versions/engines ข้างต้นเป็น snapshot ตามวันที่ตรวจ ใช้ published metadata ระบุ engine ไม่อาศัย banner เวอร์ชันบนเว็บ oclif
