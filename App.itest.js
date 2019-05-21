const puppeteer = require('puppeteer');
const program = require('commander');
program
  .option(
    '-s, --site <URL>',
    'Site to run against, default https://madliberationgame.com'
  )
  .option('-L, --slow', 'Run headfully in slow mode')
  .parse(process.argv);
const slowDown = 200;
const timeoutMs = 45000 + (program.slow ? slowDown + 2000 : 0);
const defaultUrl = 'https://madliberationgame.com';
const site = program.site || defaultUrl;
const browserOptions = {
  headless: program.slow ? false : true,
  args: ['--no-sandbox']
};
browserOptions.slowMo = slowDown;
const failTest = async (err, msg, browser) => {
  console.log('test failed: ' + msg);
  console.log(err);
  if (browser) await browser.close();
  process.exit(1);
};
const waitOptions = { timeout: timeoutMs };
const waitForNavigationOptions = { timeout: timeoutMs };
const clickOptions = { delay: 200 };
const typeOptions = { delay: 10 };
const itWait = async ({ page, madliberationid }) => {
  await page
    .waitForSelector(`[madliberationid="${madliberationid}"]`, waitOptions)
    .catch(async e => {
      failTest(e, `Could not find ${madliberationid}`);
    });
};
const itWaitForAttribute = async (page, attribute) => {
  await page.waitForSelector(`[${attribute}]`, waitOptions).catch(async e => {
    failTest(e, `Could not find attribute ${attribute}`);
  });
};
const itClick = async ({ page, madliberationid }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  await page
    .click(`[madliberationid="${madliberationid}"]`, clickOptions)
    .catch(async e => {
      failTest(e, `Could not click ${madliberationid}`);
    });
};
const itType = async ({ page, madliberationid, text }) => {
  await itClick({ page: page, madliberationid: madliberationid });
  await page
    .type(`[madliberationid="${madliberationid}"]`, text, typeOptions)
    .catch(async e => {
      failTest(e, `Could not type into ${madliberationid}`);
    });
};
const itNavigate = async ({ page, madliberationid }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  await Promise.all([
    page.click(`[madliberationid="${madliberationid}"]`, clickOptions),
    page.waitForNavigation(waitForNavigationOptions)
  ]).catch(async e => {
    failTest(e, `Could not navigate by clicking on ${madliberationid}`);
  });
};
const itGetText = async ({ page, madliberationid }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  const text = await page
    .$$(`[madliberationid="${madliberationid}"]`)
    .then(a => {
      if (!Array.isArray(a) || a.length < 1) {
        throw new Error(`Could not get text from ${madliberationid}`);
      }
      return a[0].getProperty('textContent');
    })
    .then(textContent => {
      return textContent.jsonValue();
    })
    .catch(async e => {
      failTest(e, `Failed getting text content of ${madliberationid}`);
    });
  return text;
};
const submitAllLibs = async (page, prefix) => {
  const answers = [];
  const progressText = await itGetText({
    page: page,
    madliberationid: 'lib-progress'
  });
  const progress = progressText.split('/').map(n => parseInt(n.trim()));
  if (progress.length < 2) {
    failTest('/play page', 'did not find X / Y showing lib progress');
  }
  const numLibs = progress[1];
  for (let currentLib = progress[0]; currentLib <= numLibs; currentLib++) {
    const ans = `${prefix}-${currentLib}`;
    await itType({
      page: page,
      madliberationid: `answer-${currentLib - 1}`,
      text: ans
    });
    answers.push(ans);
    if (currentLib === numLibs) {
      await itClick({ page: page, madliberationid: 'submit-answers' });
      await itNavigate({
        page: page,
        madliberationid: 'yes-submit-libs-button'
      });
      return answers;
    }
    await itClick({ page: page, madliberationid: 'next-prompt' });
  }
  failTest('/play page', 'never found a Submit Answers button');
};
(async () => {
  const browser = await puppeteer.launch(browserOptions);
  const page = await browser.newPage();
  await page.goto(site);
  await itNavigate({ page: page, madliberationid: 'lead-a-seder-button' });
  await itWait({ page: page, madliberationid: 'explain-page' });
  await itNavigate({
    page: page,
    madliberationid: 'proceed-from-explanation-button'
  });
  await itWait({ page: page, madliberationid: 'pick-your-script-page' });
  await itClick({ page: page, madliberationid: 'Practice Script' });
  await itNavigate({ page: page, madliberationid: 'pick-this-script-button' });
  await itWait({ page: page, madliberationid: 'your-room-code' });
  const roomCode = await itGetText({
    page: page,
    madliberationid: 'your-room-code'
  });
  const leaderName = `ITestLdr ${roomCode}`;
  await itType({
    page: page,
    madliberationid: 'ringleader-game-name-text-field',
    text: leaderName
  });
  await itNavigate({ page: page, madliberationid: 'thats-my-name-button' });
  const leaderNameFromTable = await itGetText({
    page: page,
    madliberationid: 'pc0'
  });
  if (leaderNameFromTable != leaderName) {
    failTest(
      'wrong name on roster',
      `expected ${leaderName}, got ` + `${leaderNameFromTable}`
    );
  }
  await itClick({ page: page, madliberationid: 'thats-everyone-button' });
  await itNavigate({
    page: page,
    madliberationid: 'confirm-thats-everyone-button'
  });
  await itNavigate({ page: page, madliberationid: 'leader-click-this-button' });
  await itWait({ page: page, madliberationid: 'lib-progress' });
  const leaderAnswers = await submitAllLibs(page, 'leader');
  await itNavigate({ page: page, madliberationid: 'i-want-the-script-button' });
  await itWait({ page: page, madliberationid: 'pass-this-device' });
  while (true) {
    await itWaitForAttribute(page, 'mlnoncontent');
    const id = await page
      .$eval('[mlnoncontent]', el => el.getAttribute('madliberationid'))
      .catch(async e => {
        failTest(e, 'failed to get madliberationid');
      });
    if (id == 'pass-this-device') {
      await itClick({ page: page, madliberationid: 'ready-to-read-button' });
      await itWait({ page: page, madliberationid: 'page' });
      await itClick({ page: page, madliberationid: 'next-page-button' });
      continue;
    }
    if (id == 'seder-ended-successfully') {
      break;
    }
    failTest('/read error', 'failed to loop through script pages');
  }
  await browser.close();
})();
