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
// bot.launch()

const helper = new thuLearnLib.Learn2018Helper({provider: () => { return { username: config.user.name, password: config.user.pwd }; }});

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

let preTimestamp = new Date();
let nowTimestamp = new Date();
let Date2ms = (day, hour) => (day * 24 + hour) * 60 * 60 * 1000;

function reminder(deadline) {
    return (deadline < nowTimestamp) ? null :   
        (deadline - nowTimestamp < Date2ms(3, 0) && deadline - preTimestamp > Date2ms(3, 0)) ? ['*3 天*', '3 days'] :
        (deadline - nowTimestamp < Date2ms(1, 0) && deadline - preTimestamp > Date2ms(1, 0)) ? ['*1 天*', '1 day'] :
        (deadline - nowTimestamp < Date2ms(0, 6) && deadline - preTimestamp > Date2ms(0, 6)) ? ['*6 小时*', '6 hours'] :
        (deadline - nowTimestamp < Date2ms(0, 1) && deadline - preTimestamp > Date2ms(0, 1)) ? ['*1 小时*', '1 hour'] :
        null;
}

function overdue(deadline) {
    return deadline < nowTimestamp && deadline > preTimestamp; 
}

function compareHomeworks(courseName, nowdata, predata) {
    nowdata.forEach(homework => {
        const pre = predata.filter(x => { return homework.id == x.id });
        if (pre.length == 0) {
            logger.info(`New homework: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `「${reMarkdown(courseName)}」布置了新的作业：` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('New homework: sendMessage FAIL');
            });
            return;
        }
        let ret;
        if (homework.deadline.toISOString() != (typeof pre[0].deadline == 'string' ? pre[0].deadline : pre[0].deadline.toISOString())) {
            logger.info(`Homework deadline modified: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `截止时间变更：「${reMarkdown(courseName)}」` + 
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error('Homework deadline modified: sendMessage FAIL');
            });
        } else if (homework.submitted == false && (ret = reminder(homework.deadline)) != null) {
            logger.info(`Homework deadline ${ret[1]} left: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `作业还剩 ${ret[0]}！\n` + 
                `「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error(`Homework deadline ${ret[1]} left: sendMessage FAIL`);
            });
        } else if (homework.submitted == false && overdue(homework.deadline)) {
            logger.info(`Homework deadline overdue: <${courseName}> ${homework.title}`);
            bot.telegram.sendMessage(config.channel, 
                `作业截止！\n` + 
                `「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' })
            .then(() => {}, function(error) { 
                logger.error(`Homework deadline overdue: sendMessage FAIL`);
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
    } catch (err) {
        logger.error(err);
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
    while (true) {
        try {
            logger.info('Login...');
            await Promise.race([
                helper.login(config.user.name, config.user.pwd),
                new Promise((resolve, reject) => setTimeout(() => reject(TIMEOUT), 60 * 1000))
            ]);
            logger.info('Login successful.');
            break;
        } catch (err) { logger.error('Timeout.'); }
    }

    let predata = [];

    try {
        predata = await JSON.parse(fs.readFileSync('data.json', 'utf8'));
    } catch (err) {
        logger.error(err);
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
            nowTimestamp = new Date();

            // logger.debug('Getting course list...');
            const courses = await getCourseList(config.semester);
            for (let course of courses) {
                tasks.push((async () => {
                    course.files = await helper.getFileList(course.id);
                    // course.discussions = await helper.getDiscussionList(course.id);
                    course.notifications = await helper.getNotificationList(course.id);
                    course.homeworks = await helper.getHomeworkList(course.id);
                    // course.questions = await helper.getAnsweredQuestionList(course.id);
                    await new Promise((resolve => {
                        nowdata.push(course);
                        // logger.debug(`Course <${course.name}> finished.`);
                        resolve();
                    }));
                })());
            };
            await Promise.race([
                Promise.all(tasks),
                new Promise((resolve, reject) => setTimeout(() => reject(TIMEOUT), 120 * 1000))
            ]);
            // logger.debug('Got all data.');

            for (let course of nowdata) {
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
            }

            fs.writeFileSync('data.json', JSON.stringify(nowdata, null, 4));
            predata = nowdata;
            preTimestamp = nowTimestamp;
            logger.debug('Checked.');
        } catch (err) {
            if (err === TIMEOUT) {
                logger.error('Timeout.');
                continue;
            } else {
                logger.error(err);
                while (true) {
                    try {
                        logger.info('Relogin...');
                        await Promise.race([
                            helper.login(config.user.name, config.user.pwd),
                            new Promise((resolve, reject) => setTimeout(() => reject(TIMEOUT), 60 * 1000))
                        ]);
                        logger.info('Login successful.');
                        break;
                    } catch (err) { logger.error('Timeout.'); }
                }
            }
        }
        await delay(60 * 1000);
    }
})();
