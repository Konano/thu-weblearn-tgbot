const Telegraf = require('telegraf');
const fs = require('fs');
const htmlToText = require('html-to-text');
const SocksAgent = require('socks5-https-client/lib/Agent');
const thuLearnLib = require('thu-learn-lib');
// const types = require('thu-learn-lib/lib/types');
const moment = require('moment');

const log4js = require('log4js');
log4js.configure({
    appenders: { 
        console: { type: 'console' },
        logfile: { type: 'file', filename: 'runtime.log' },
        fileFilter: { type: 'logLevelFilter', level: 'info', appender: 'logfile' }
    },
    categories: { 
        default: { appenders: ['console', 'fileFilter'], level: 'debug' }
    }
});
const logger = log4js.getLogger('default');

var config = require('./config');

let bot;
if (config.proxy.status) {
    const socksAgent = new SocksAgent({
        socksHost: config.proxy.host,
        socksPort: config.proxy.port,
    });
    bot = new Telegraf(config.token, { telegram: { agent: socksAgent } })
} else {
    bot = new Telegraf(config.token)
}

bot.catch((err, ctx) => {
    logger.error(`Ooops, encountered an error for ${ctx.updateType}`, err)
})
bot.launch()

let helper = new thuLearnLib.Learn2018Helper();

async function delay(ms) {
    return await new Promise(resolve => setTimeout(resolve, ms));
}

function findCourse(predata, courseID) {
    var ret = null;
    predata.forEach(x => { if (x.id == courseID) ret = x });
    return ret;
}

function reBlank(str) {
    if (typeof str == "string") {
        return str.replace(/\n\s*\n/gi, '\n').replace(/^\s*/m, '').replace(/\s*$/m, '');
    } else {
        return str;
    }
}

function reMarkdown(str) {
    if (typeof str == "string") {
        return str.replace(/([\*\_\`\[])/gi, '\\$1');
    } else {
        return str;
    }
}

function compareFiles(courseName, nowdata, predata) {
    nowdata.forEach(file => {
        if (predata.filter(x => { return file.id == x.id }).length == 0) {
            logger.info(`New file: <${courseName}> ${file.title}`);
            bot.telegram.sendMessage(config.channel, 
                `「${reMarkdown(courseName)}」发布了新的文件：` + 
                `[${reMarkdown(file.title)}](${file.downloadUrl.replace(/learn2018/, 'learn')})`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('New file: sendMessage FAIL');
            });
        }
    });
}

function compareHomeworks(courseName, nowdata, predata) {
    nowdata.forEach(homework => {
        const pre = predata.filter(x => { return homework.id == x.id });
        if (pre.length == 0) {
            logger.info(`New homework: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `「${reMarkdown(courseName)}」布置了新的作业：` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止日期：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('New homework: sendMessage FAIL');
            });
            return;
        }
        if (homework.deadline.toISOString() != (typeof pre[0].deadline == 'string' ? pre[0].deadline : pre[0].deadline.toISOString())) {
            logger.info(`Homework deadline modified: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `截止时间变更：「${reMarkdown(courseName)}」` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止日期：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('Homework deadline modified: sendMessage FAIL');
            });
        }
        if (homework.submitted && !pre[0].submitted) {
            logger.info(`Homework submited: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `已提交作业：「${reMarkdown(courseName)}」` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('Homework submited: sendMessage FAIL');
            });
        }
        if (homework.gradeTime && (pre[0].gradeTime == undefined || 
                homework.gradeTime.toISOString() != (typeof pre[0].gradeTime == 'string' ? pre[0].gradeTime : pre[0].gradeTime.toISOString()))) {
            logger.info(`Homework scored: <${courseName}> ${homework.title}`);
            let content = 
                `作业有新的评分：「${reMarkdown(courseName)}」` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n`;
            if (homework.gradeLevel)
                content += `分数等级：${reMarkdown(homework.gradeLevel)}\n`
            else if (homework.grade)
                content += `分数：${reMarkdown(homework.grade)}\n`
            if (homework.gradeContent)
                content += `====================\n` + `${reMarkdown(homework.gradeContent)}`
            bot.telegram.sendMessage(config.channel, content, { parse_mode : 'Markdown' }).then(() => {}, function(error) { 
                logger.error('Homework scored: sendMessage FAIL');
            });
        }
    });
}

function compareNotifications(courseName, nowdata, predata) {
    try {
        nowdata.forEach(notification => {
            if (predata.filter(x => { return notification.id == x.id }).length == 0) {
                logger.info(`New nofitication: <${courseName}> ${notification.title}`);
                bot.telegram.sendMessage(config.channel, 
                    `「${reMarkdown(courseName)}」发布了新的公告：` + 
                    `[${reMarkdown(notification.title)}](${notification.url.replace(/learn2018/, 'learn')})\n` +
                    `====================\n` + 
                    reMarkdown(reBlank(htmlToText.fromString(notification.content))),
                    { parse_mode : 'Markdown' })
                .then(() => {}, function(error) { 
                    logger.error('New nofitication: sendMessage FAIL');
                });
            }
        });
    } catch (error) {
        logger.error(err)
    }
}

const TIMEOUT = Symbol("Timeout");

async function getCourseList(semester) {
    return Promise.race([
        helper.getCourseList(semester),
        new Promise((resolve, reject) => setTimeout(() => reject(TIMEOUT), 30 * 1000))
    ])
}

(async () => {
    logger.info('Login...');
    await helper.login(config.user.name, config.user.pwd);
    logger.info('Login successful.');

    let predata = [];

    try {
        predata = await JSON.parse(fs.readFileSync('data.json', 'utf8'));
    } catch (error) {
        let tasks = [];
        const courses = await helper.getCourseList(config.semester);
        for (let course of courses) {
            tasks.push((async () => {
                course.files = await helper.getFileList(course.id);
                // course.discussions = await helper.getDiscussionList(course.id);
                course.notifications = await helper.getNotificationList(course.id);
                course.homeworks = await helper.getHomeworkList(course.id);
                // course.questions = await helper.getAnsweredQuestionList(course.id);

                await new Promise((resolve => {
                    predata.push(course);
                    resolve();
                }));
            })());
        };

        await Promise.all(tasks);
        fs.writeFileSync('data.json', JSON.stringify(predata, null, 4));
    };

    while (true) {
        logger.debug('Start checking...');
        try {
            let nowdata = [];
            let tasks = [];
            // logger.debug('Getting course list...');
            const courses = await getCourseList(config.semester);
            for (let course of courses) {
                tasks.push((async () => {
                    course.files = await helper.getFileList(course.id);
                    // course.discussions = await helper.getDiscussionList(course.id);
                    course.notifications = await helper.getNotificationList(course.id);
                    course.homeworks = await helper.getHomeworkList(course.id);
                    // course.questions = await helper.getAnsweredQuestionList(course.id);

                    const coursePredata = findCourse(predata, course.id);
                    if (coursePredata != null) {
                        compareFiles(course.name, course.files, coursePredata.files);
                        // compareDiscussions(course.discussions, coursePredata.discussions);
                        compareNotifications(course.name, course.notifications, coursePredata.notifications);
                        compareHomeworks(course.name, course.homeworks, coursePredata.homeworks);
                        // compareQuestions(course.questions, coursePredata.questions);
                    } else {
                        logger.info(`New course: <${course.name}>`);
                        bot.telegram.sendMessage(config.channel, `新课程：「${reMarkdown(course.name)}」`).then(() => {}, function(error) { 
                            logger.error('New course: sendMessage FAIL');
                        });
                    }
                    await new Promise((resolve => {
                        nowdata.push(course);
                        // logger.debug(`Course <${course.name}> finished.`);
                        resolve();
                    }));
                })());
            };

            await Promise.race([
                Promise.all(tasks),
                new Promise((resolve, reject) => setTimeout(() => reject(TIMEOUT), 60 * 1000))
            ]);

            fs.writeFileSync('data.json', JSON.stringify(nowdata, null, 4));
            predata = nowdata;
            logger.debug('Checked.');
        } catch (err) {
            if (err === TIMEOUT) {
                logger.error('Timeout.');
                continue;
            } else {
                logger.error(err);
                logger.info('Relogin...');
                await helper.login(config.user.name, config.user.pwd);
                logger.info('Login successful.');
            }
        }
        await delay(60 * 1000);
    }
})();
