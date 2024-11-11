import assert from "assert";
import { TextDecoder } from 'util';
import { workspace } from "vscode";
import { TestSuite } from ".";
import { Tools } from "../api/Tools";
import { instance } from "../instantiate";
import { IBMiObject } from "../typings";
import { getMemberUri } from "../filesystems/qsys/QSysFs";
import IBMi from "../api/IBMi";

const contents = {
  '37': [`Hello world`],
  '273': [`Hello world`, `àáãÄÜö£øß`],
  '277': [`Hello world`, `çñßØ¢åæ`],
  '297': [`Hello world`, `âÑéè¥ýÝÞã`],
  '290': [`ｦｯ!ﾓﾄｴﾜﾈﾁｾ`, `Hello world`, `ｦｯ!ﾓﾄｴﾜﾈﾁｾ`],
  // '420': [`Hello world`, `ص ث ب ﻷ`],
  '420': [`Hello world`, `ص ث ب`],
}

const testData = {
  '273': {
    library: 'AÜ§#$%Ä',
    libraryText: '§#$öße',
    object: 'àáãÄ£ø',
    objectText: 'Üä$öß',
    member: '§#$MAN',
    memberText: '§#$öße',
    memberType: 'CBLLE'
  },
  '935': {
    library: '我能吞下',
    libraryText: '我能吞下',
    object: '㐀᠀ༀꀀ',
    objectText: '㐀᠀ༀꀀ',
    member: '伤身体测',
    memberText: '伤身体测',
    memberType: 'CBLLE'
  },
  '937': {
    library: '陰陽學說',
    libraryText: '然的理性',
    object: '是古人認',
    objectText: '知識人認',
    member: '識觀察自',
    memberText: '認識觀察',
    memberType: 'CBLLE'
  },
  '284': {
    library: 'üóíñ',
    libraryText: 'üóíñ',
    object: 'üóíÑ',
    objectText: 'üóíÑ',
    member: 'üóíñ',
    memberText: 'üóíñ',
    memberType: 'CBLLE'
  },
  '5035': {
    library: 'ｱｲｳｴ',
    libraryText: 'ｶｷｱｲ',
    object: 'ｵｶｷｱ',
    objectText: 'ｳｴｵｶ',
    member: 'ｲｳｴｵ',
    memberText: 'ｷｳｴｵ',
    memberType: 'CBLLE'
  },
  '933': {
    library: '나는유리',
    libraryText: '나는유리',
    object: '를먹을유',
    objectText: '를먹을유',
    member: '리를는유',
    memberText: '리를는유',
    memberType: 'CBLLE'
  }
}

const rtlEncodings = [`420`];

async function runCommandsWithCCSID(connection: IBMi, commands: string[], ccsid: number) {
  const testPgmSrcFile = `TESTING`;
  const config = connection.config!;

  const tempLib = config.tempLibrary;
  const testPgmName = `T${commands.length}${ccsid}`;
  const sourceFileCreated = await connection!.runCommand({ command: `CRTSRCPF FILE(${tempLib}/${testPgmSrcFile}) RCDLEN(112) CCSID(${ccsid})`, noLibList: true });

  await connection.content.uploadMemberContent(undefined, tempLib, testPgmSrcFile, testPgmName, commands.join(`\n`));

  const compileCommand = `CRTBNDCL PGM(${tempLib}/${testPgmName}) SRCFILE(${tempLib}/${testPgmSrcFile}) SRCMBR(${testPgmName}) REPLACE(*YES)`;
  const compileResult = await connection.runCommand({ command: compileCommand, noLibList: true });

  if (compileResult.code !== 0) {
    return compileResult;
  }

  const callCommand = `CALL ${tempLib}/${testPgmName}`;
  const result = await connection.runCommand({ command: callCommand, noLibList: true });

  return result;
}

export const EncodingSuite: TestSuite = {
  name: `Encoding tests`,
  before: async () => {
    const config = instance.getConfig()!;
    assert.ok(config.enableSourceDates, `Source dates must be enabled for this test.`);
  },

  tests: [
    {
      name: "Listing objects with variants",
      test: async () => {
        const connection = instance.getConnection();
        const content = instance.getConnection()?.content;
        if (connection && content && connection.getEncoding().ccsid !== 37) {
          const tempLib = connection.config?.tempLibrary!;
          const ccsid = connection.getEncoding().ccsid;

          let library = `TESTLIB${connection.variantChars.local}`;
          let skipLibrary = false;
          const sourceFile = `TESTFIL${connection.variantChars.local}`;
          const dataArea = `TSTDTA${connection.variantChars.local}`;
          const members: string[] = [];

          for (let i = 0; i < 5; i++) {
            members.push(`TSTMBR${connection.variantChars.local}${i}`);
          }
          try {
            await connection.runCommand({ command: `DLTLIB LIB(${library})`, noLibList: true });

            const crtLib = await connection.runCommand({ command: `CRTLIB LIB(${library}) TYPE(*PROD)`, noLibList: true });
            if (Tools.parseMessages(crtLib.stderr).findId("CPD0032")) {
              //Not authorized: carry on, skip library name test
              library = tempLib;
              skipLibrary = true
            }

            let commands: string[] = [];

            commands.push(`CRTSRCPF FILE(${library}/${sourceFile}) RCDLEN(112) CCSID(${ccsid})`);
            for (const member of members) {
              commands.push(`ADDPFM FILE(${library}/${sourceFile}) MBR(${member}) SRCTYPE(TXT)`);
            }

            commands.push(`CRTDTAARA DTAARA(${library}/${dataArea}) TYPE(*CHAR) LEN(50) VALUE('hi')`);

            // runCommandsWithCCSID proves that using variant characters in runCommand works!
            const result = await runCommandsWithCCSID(connection, commands, ccsid);
            assert.strictEqual(result.code, 0);

            if (!skipLibrary) {
              const [expectedLibrary] = await content.getLibraries({ library });
              assert.ok(expectedLibrary);
              assert.strictEqual(library, expectedLibrary.name);

              const validated = await connection.content.validateLibraryList([tempLib, library]);
              assert.strictEqual(validated.length, 0);
            }

            const checkFile = (expectedObject: IBMiObject) => {
              assert.ok(expectedObject);
              assert.ok(expectedObject.sourceFile, `${expectedObject.name} not a source file`);
              assert.strictEqual(expectedObject.name, sourceFile);
              assert.strictEqual(expectedObject.library, library);
            };

            const objectList = await content.getObjectList({ library, types: ["*ALL"] });
            assert.ok(objectList.some(obj => obj.library === library && obj.type === `*FILE` && obj.name === sourceFile));
            assert.ok(objectList.some(obj => obj.library === library && obj.type === `*DTAARA` && obj.name === dataArea));

            const [expectDataArea] = await content.getObjectList({ library, object: dataArea, types: ["*DTAARA"] });
            assert.strictEqual(expectDataArea.name, dataArea);
            assert.strictEqual(expectDataArea.library, library);
            assert.strictEqual(expectDataArea.type, `*DTAARA`);

            const [expectedSourceFile] = await content.getObjectList({ library, object: sourceFile, types: ["*SRCPF"] });
            checkFile(expectedSourceFile);

            const expectedMembers = await content.getMemberList({ library, sourceFile });
            assert.ok(expectedMembers);
            assert.ok(expectedMembers.every(member => members.find(m => m === member.name)));
          }
          finally {
            // if (!skipLibrary && await content.checkObject({ library: "QSYS", name: library, type: "*LIB" })) {
            //   await connection.runCommand({ command: `DLTLIB LIB(${library})`, noLibList: true })
            // }
            // if (skipLibrary && await content.checkObject({ library, name: sourceFile, type: "*FILE" })) {
            //   await connection.runCommand({ command: `DLTF FILE(${library}/${sourceFile})`, noLibList: true })
            // }
          }
        }
      }
    },
    {
      name: `Variant character in source names and commands`, test: async () => {
        // CHGUSRPRF X CCSID(284) CNTRYID(ES) LANGID(ESP)
        const connection = instance.getConnection()!;
        const config = instance.getConfig()!;

        const ccsidData = connection.getCcsids()!;

        const tempLib = config.tempLibrary;
        const varChar = connection.variantChars.local[0];
        
        const testFile = `${varChar}SOURCES`;
        const testMember = `${varChar}MEMBER`;

        const attemptDelete = await connection.runCommand({ command: `DLTF FILE(${tempLib}/${connection.sysNameInAmerican(testFile)})`, noLibList: true });

        const createResult = await runCommandsWithCCSID(connection, [`CRTSRCPF FILE(${tempLib}/${testFile}) RCDLEN(112) CCSID(${ccsidData.userDefaultCCSID})`], ccsidData.userDefaultCCSID);
        assert.strictEqual(createResult.code, 0);

        const addPf = await connection.runCommand({ command: `ADDPFM FILE(${tempLib}/${testFile}) MBR(${testMember}) SRCTYPE(TXT)`, noLibList: true });
        assert.strictEqual(addPf.code, 0);

        const attributes = await connection.content.getAttributes({ library: tempLib, name: testFile, member: testMember }, `CCSID`);
        assert.ok(attributes);
        assert.strictEqual(attributes[`CCSID`], String(ccsidData.userDefaultCCSID));

        const objects = await connection.content.getObjectList({ library: tempLib, types: [`*SRCPF`] });
        assert.ok(objects.length);
        assert.ok(objects.some(obj => obj.name === testFile));

        const members = await connection.content.getMemberList({ library: tempLib, sourceFile: testFile });
        assert.ok(members.length);
        assert.ok(members.some(m => m.name === testMember));
        assert.ok(members.some(m => m.file === testFile));

        await connection.content.uploadMemberContent(undefined, tempLib, testFile, testMember, [`**free`, `dsply 'Hello world';`, `return;`].join(`\n`));

        const compileResult = await connection.runCommand({ command: `CRTBNDRPG PGM(${tempLib}/${testMember}) SRCFILE(${tempLib}/${testFile}) SRCMBR(${testMember})`, noLibList: true });
        assert.strictEqual(compileResult.code, 0);

        const memberUri = getMemberUri({ library: tempLib, file: testFile, name: testMember, extension: `RPGLE` });

        const content = await workspace.fs.readFile(memberUri);
        let contentStr = new TextDecoder().decode(content);
        assert.ok(contentStr.includes(`dsply 'Hello world';`));

        await workspace.fs.writeFile(memberUri, Buffer.from(`Woah`, `utf8`));

        const memberContentBuf = await workspace.fs.readFile(memberUri);
        let fileContent = new TextDecoder().decode(memberContentBuf);

        assert.ok(fileContent.includes(`Woah`));
      },
    },

    ...Object.keys(contents).map(ccsid => ({
      name: `Encoding ${ccsid}`, test: async () => {
        const connection = instance.getConnection();
        const config = instance.getConfig()!;

        const oldLines = contents[ccsid as keyof typeof contents];
        const lines = oldLines.join(`\n`);

        const tempLib = config!.tempLibrary;

        const file = `TEST${ccsid}`;

        await connection!.runCommand({ command: `CRTSRCPF FILE(${tempLib}/${file}) RCDLEN(112) CCSID(${ccsid})`, noLibList: true });
        await connection!.runCommand({ command: `ADDPFM FILE(${tempLib}/${file}) MBR(THEMEMBER) SRCTYPE(TXT)`, noLibList: true });

        const theBadOneUri = getMemberUri({ library: tempLib, file, name: `THEMEMBER`, extension: `TXT` });

        await workspace.fs.readFile(theBadOneUri);

        await workspace.fs.writeFile(theBadOneUri, Buffer.from(lines, `utf8`));

        const memberContentBuf = await workspace.fs.readFile(theBadOneUri);
        let fileContent = new TextDecoder().decode(memberContentBuf);

        if (rtlEncodings.includes(ccsid)) {
          const newLines = fileContent.split(`\n`);

          assert.strictEqual(newLines.length, 2);
          assert.ok(newLines[1].startsWith(` `)); // RTL

          assert.strictEqual(newLines[0].trim(), oldLines[0]);
          assert.strictEqual(newLines[1].trim(), oldLines[1]);
        } else {
          assert.deepStrictEqual(fileContent, lines);
        }
      }
    })),

    ...Object.keys(testData).map(ccsid => {
      return {
        name: `Object name and text with CCSID ${ccsid}`, test: async () => {
          const connection = instance.getConnection();
          const content = instance.getContent();
          const test = testData[ccsid as keyof typeof testData];

          if (connection && content && connection.getEncoding().ccsid === Number(ccsid)) {
            const crtlibRes = await connection!.runCommand({ command: `CRTLIB LIB("${test.library}") TEXT("${test.libraryText}")`, noLibList: true, environment: "ile" });
            const crtsrcpfRes = await connection!.runCommand({ command: `CRTSRCPF FILE("${test.library}"/"${test.object}") RCDLEN(112) CCSID(${ccsid}) TEXT("${test.objectText}")`, noLibList: true, environment: "ile" });
            const addpfmRes = await connection!.runCommand({ command: `ADDPFM FILE("${test.library}"/"${test.object}") MBR("${test.member}") SRCTYPE(${test.memberType}) TEXT("${test.memberText}")`, noLibList: true, environment: "ile" })
            const libraries = await content!. getObjectList({ library: `"${test.library}"`, types: ['*LIB'] });
            const objects = await content!.getObjectList({ library: `"${test.library}"`, object: `"${test.object}"` });
            const members = await content!.getMemberList({ library: `"${test.library}"`, sourceFile: `"${test.object}"`, members: `"${test.member}"` });

            //TODO: Uncomment once CCSID issues have been investigated and resolved
            // const dltLib = await connection!.runCommand({ command: `DLTLIB LIB("${test.library}")`, noLibList: true, environment: "ile" });

            assert.strictEqual(libraries.length, 1);
            assert.strictEqual(libraries[0].library, test.library);
            assert.strictEqual(libraries[0].text, test.libraryText);
            assert.strictEqual(objects.length, 1);
            assert.strictEqual(objects[0].name, test.object);
            assert.strictEqual(objects[0].text, test.objectText);
            assert.strictEqual(members.length, 1);
            assert.strictEqual(members[0].name, test.member);
            assert.strictEqual(members[0].text, test.memberText);
          }
        }
      }
    })
  ]
};
