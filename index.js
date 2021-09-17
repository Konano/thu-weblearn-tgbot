import { readFileSync, writeFileSync } from 'fs';
import { htmlToText } from 'html-to-text';
import { Learn2018Helper } from 'thu-learn-lib';
import moment from 'moment';
import { request } from 'https';
import { stringify } from 'querystring';
import pkg from 'log4js';
const { configure, getLogger } = pkg;

import { config } from './config.js';

configure({
    appenders: {
        console: { type: 'console' },
        logfile: { type: 'file', filename: 'log/runtime.log', maxLogSize: 1024 * 128, backups: 10 },
        consoleFilter: { type: 'logLevelFilter', level: 'info', appender: 'console' },
        fileFilter: { type: 'logLevelFilter', level: 'debug', appender: 'logfile' }
    },
    categories: {
        default: { appenders: ['consoleFilter', 'fileFilter'], level: 'debug' }
    }
});
const logger = getLogger('default');

function sendMessage(msg, errmsg) {
    logger.debug('sendMessage Start');
    try {
        const params = {
            chat_id: config.channel,
            text: msg,
            parse_mode: 'Markdown'
        };
        const options = {
            hostname: config.apiproxy,
            port: 443,
            path: `/bot${config.token}/sendMessage?${stringify(params)}`,
            method: 'GET'
        };
        request(options, res => {
            logger.debug(`statusCode: ${res.statusCode}`);
            res.on('data', d => { logger.debug(d.toString()) })
        }).on('error', error => {
            logger.debug('request error');
            logger.debug(error);
            logger.error(errmsg);
            sendMessage(msg, errmsg);
        }).end(() => {
            logger.debug('request end');
        });
    } catch (err) {
        logger.error(err);
    }
    logger.debug('sendMessage Return');
}

const helper = new Learn2018Helper({ provider: () => { return { username: config.user.name, password: config.user.pwd }; } });

async function delay(ms) {
    return await new Promise(resolve => setTimeout(resolve, ms));
}

function findCourse(predata, courseID) {
    let ret = null;
    predata.forEach(x => { if (x.id == courseID) ret = x });
    return ret;
}

function reBlank(str) {
    if (typeof str == 'string') {
        return str.replace(/\n\s*\n/gi, '\n').replace(/^\s*/m, '').replace(/\s*$/m, '');
    } else {
        return str;
    }
}

function reMarkdown(str) {
    if (typeof str == 'string') {
        return str.replace(/([\*\_\`\[])/gi, '\\$1');
    } else {
        return str;
    }
}

function compareFiles(courseName, nowdata, predata) {
    nowdata.forEach(file => {
        if (predata.filter(x => { return file.id == x.id }).length == 0 && nowTimestamp - file.uploadTime < Date2ms(3, 0)) {
            logger.info(`New file: <${courseName}> ${file.title}`);
            let text =
                `「${reMarkdown(courseName)}」发布了新的文件：` +
                `[${reMarkdown(file.title)}](${file.downloadUrl.replace(/learn2018/, 'learn')})`;
            if (file.description != "") {
                text +=
                    `\n====================\n` +
                    reMarkdown(reBlank(htmlToText(file.description)));
            }
            sendMessage(text, 'New file: sendMessage FAIL');
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
            let text =
                `「${reMarkdown(courseName)}」布置了新的作业：` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` +
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`
            if (homework.description != "") {
                text +=
                    `\n====================\n` +
                    reMarkdown(reBlank(htmlToText(homework.description)));
            }
            sendMessage(text, 'New homework: sendMessage FAIL');
            return;
        }
        let ret;
        if (homework.deadline.toISOString() != (typeof pre[0].deadline == 'string' ? pre[0].deadline : pre[0].deadline.toISOString())) {
            logger.info(`Homework deadline modified: <${courseName}> ${homework.title}`);
            sendMessage(
                `截止时间变更：「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` +
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                'Homework deadline modified: sendMessage FAIL');
        } else if (homework.submitted == false && (ret = reminder(homework.deadline)) != null) {
            logger.info(`Homework deadline ${ret[1]} left: <${courseName}> ${homework.title}`);
            sendMessage(
                `作业还剩 ${ret[0]}！\n` +
                `「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` +
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                `Homework deadline ${ret[1]} left: sendMessage FAIL`);
        } else if (homework.submitted == false && overdue(homework.deadline)) {
            logger.info(`Homework deadline overdue: <${courseName}> ${homework.title}`);
            sendMessage(
                `作业截止！\n` +
                `「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n` +
                `截止时间：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                `Homework deadline overdue: sendMessage FAIL`);
        }
        if (homework.submitted && !pre[0].submitted) {
            logger.info(`Homework submited: <${courseName}> ${homework.title}`);
            sendMessage(
                `已提交作业：「${reMarkdown(courseName)}」` +
                `[${reMarkdown(homework.title)}](${homework.url.replace(/learn2018/, 'learn')})\n`,
                'Homework submited: sendMessage FAIL');
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
            sendMessage(content, 'Homework scored: sendMessage FAIL');
        }
    });
}

function compareNotifications(courseName, nowdata, predata) {
    try {
        nowdata.forEach(notification => {
            if (predata.filter(x => { return notification.id == x.id }).length == 0 && nowTimestamp - notification.publishTime < Date2ms(3, 0)) {
                logger.info(`New nofitication: <${courseName}> ${notification.title}`);
                let text =
                    `「${reMarkdown(courseName)}」发布了新的公告：` +
                    `[${reMarkdown(notification.title)}](${notification.url.replace(/learn2018/, 'learn')})`;
                if (notification.content != "") {
                    text +=
                        `\n====================\n` +
                        reMarkdown(reBlank(htmlToText(notification.content)));
                }
                sendMessage(text, 'New nofitication: sendMessage FAIL');
            }
        });
    } catch (err) {
        logger.error(err);
    }
}

const TIMEOUT = Symbol('Timeout');

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
        } catch (err) { logger.error('Login timeout.'); }
    }

    let predata = [];

    try {
        predata = await JSON.parse(readFileSync('data.json', 'utf8'));
    } catch (err) {
        logger.error(err);
        let tasks = [];
        let courses = [];
        for (let semester of config.semesters) {
            courses = courses.concat(await getCourseList(semester));
        }
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
        writeFileSync('data.json', JSON.stringify(predata, null, 4));
    };

    while (true) {
        logger.debug('Start checking...');
        try {
            let nowdata = [];
            let tasks = [];
            nowTimestamp = new Date();

            // logger.debug('Getting course list...');
            let courses = [];
            for (let semester of config.semesters) {
                courses = courses.concat(await getCourseList(semester));
            }
            // logger.debug('Got course list.');
            // logger.debug(courses);
            for (let course of courses) {
                tasks.push((async () => {
                    course.files = await helper.getFileList(course.id);
                    // course.discussions = await helper.getDiscussionList(course.id);
                    course.notifications = await helper.getNotificationList(course.id);
                    course.homeworks = await helper.getHomeworkList(course.id);
                    // course.questions = await helper.getAnsweredQuestionList(course.id);

                    logger.debug(`Course <${course.name}>: files ${course.files.length} notifications ${course.notifications.length} homeworks ${course.homeworks.length}`);

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
                    sendMessage(`新课程：「${reMarkdown(course.name)}」`, 'New course: sendMessage FAIL');
                }
            }

            writeFileSync('data.json', JSON.stringify(nowdata, null, 4));
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
                        logger.info('Relogin successful.');
                        break;
                    } catch (err) {
                        logger.error('Relogin timeout.');
                        await delay(10 * 1000);
                    }
                }
            }
        }
        await delay(60 * 1000);
    }
})();

(async () => {
    while (true) {
        try {
            if (global.gc) {
                global.gc();
                logger.info('global.gc()');
            }
        } catch (e) {
            logger.error('ERROR: `node --expose-gc index.js`');
        }
        await delay(3600 * 1000);
    }
})();
