import Testdroid from 'testdroid-client';

async () => {
  let baseUrl = process.argv[2];
  let username = process.argv[3];
  let password = process.argv[4];
  let projectName = process.argv[5];

  if (process.argv.length < 5) {
    process.exit("Must supply url, username, and password");
  }

  try {
    let session, t, project;
    t = new Testdroid(baseUrl, username, password);
    project = await t.getProject(projectName);
    console.log(project);
    project = project[0];

    let testRun = await t.createTestRun(project);
    console.log(testRun);
  }
  catch (e) {
    console.log(e);
  }
  if (session) {
    await t.stopDeviceSession(session.id);
  }
}();