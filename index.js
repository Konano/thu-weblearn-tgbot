const Telegraf = require('telegraf');
const _ = require('lodash');
const fs = require("fs");
const htmlToText = require('html-to-text');
const SocksAgent = require('socks5-https-client/lib/Agent');
const thuLearnLib = require('thu-learn-lib');
const ContentType = require('thu-learn-lib/lib/types');
const moment = require('moment');
// const thuLearnLibUtil = require('thu-learn-lib/lib/utils');

var config = require('./config');

const socksAgent = new SocksAgent({
    socksHost: config.proxy.host,
    socksPort: config.proxy.port,
});
const bot = new Telegraf(config.token, { telegram: { agent: socksAgent } })
// bot.start((ctx) => ctx.reply('Welcome!'))
// bot.help((ctx) => ctx.reply('Send me a sticker'))
// bot.on('sticker', (ctx) => ctx.reply('👍'))
bot.hears('hi', (ctx) => ctx.reply('Hey there'))
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

async function compareFiles(courseName, nowdata, predata) {
    nowdata.forEach(file => {
        if (predata.filter(x => { return file.id == x.id }).length == 0) {
            bot.telegram.sendMessage(config.owner, 
                `「${courseName}」发布了新的文件：` + 
                `[${file.title}](${file.downloadUrl.replace(/learn2018/, "learn")})`,
                { parse_mode : 'Markdown' });
        }
    });
}

async function compareHomeworks(courseName, nowdata, predata) {
    nowdata.forEach(homework => {
        const pre = predata.filter(x => { return homework.id == x.id });
        if (pre.length == 0) {
            bot.telegram.sendMessage(config.owner, 
                `「${courseName}」布置了新的作业：` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, "learn")})\n` + 
                `截止日期：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' });
            return;
        }
        if (homework.submitted && !pre[0].submitted) {
            bot.telegram.sendMessage(config.owner, 
                `已提交作业：「${courseName}」` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, "learn")})\n`,
                { parse_mode : 'Markdown' });
        }
        if (homework.gradeTime && (pre[0].gradeTime == undefined || 
                homework.gradeTime.toISOString() == (typeof pre[0].gradeTime == 'string' ? pre[0].gradeTime : pre[0].gradeTime.toISOString()))) {
            let content = 
                `作业有新的评分：「${courseName}」` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, "learn")})\n`;
            if (homework.gradeLevel)
                content += `分数等级：${homework.gradeLevel}\n`
            else if (homework.grade)
                content += `分数：${homework.grade}\n`
            if (homework.gradeContent)
                content += `====================\n` + `${homework.gradeContent}`
            bot.telegram.sendMessage(config.owner, content, { parse_mode : 'Markdown' });
        }
    });
}

async function compareNotifications(courseName, nowdata, predata) {
    nowdata.forEach(notification => {
        if (predata.filter(x => { return notification.id == x.id }).length == 0) {
            bot.telegram.sendMessage(config.owner, 
                `「${courseName}」发布了新的公告：` + 
                `[${notification.title}](${notification.url.replace(/learn2018/, "learn")})\n` +
                `====================\n` + 
                htmlToText.fromString(notification.content),
                { parse_mode : 'Markdown' });
        }
    });
}

(async () => {
    await helper.login(config.user.name, config.user.pwd);
    console.log('Login successful.')
    // const semesters = await helper.getSemesterIdList();
    // for (let semesterId of semesters) {
    //     if (semesterId === config.semester) {
    //     }
    // }

    let predata = [];

    try {
        predata = await JSON.parse(fs.readFileSync('data123123.json', 'utf8'));
    } catch (error) {
        let tasks = [];
        const courses = await helper.getCourseList(config.semester);
        for (let course of courses) {
            tasks.push((async () => {
                let courseTasks = [];

                courseTasks.push((async () => {
                    course.files = await helper.getFileList(course.id);
                    await new Promise((resolve => { resolve() }));
                })());
                
                // courseTasks.push((async () => {
                //     course.discussions = await helper.getDiscussionList(course.id);
                //     await new Promise((resolve => { resolve() }));
                // })());

                courseTasks.push((async () => {
                    course.notifications = await helper.getNotificationList(course.id);
                    await new Promise((resolve => { resolve() }));
                })());

                courseTasks.push((async () => {
                    course.homeworks = await helper.getHomeworkList(course.id);
                    await new Promise((resolve => { resolve() }));
                })());

                // courseTasks.push((async () => {
                //     course.questions = await helper.getAnsweredQuestionList(course.id);
                //     await new Promise((resolve => { resolve() }));
                // })());

                await Promise.all(courseTasks);

                await new Promise((resolve => {
                    predata.push(course);
                    console.log(course.name)
                    resolve();
                }));
            })());
        };

        await Promise.all(tasks);
        fs.writeFileSync('data.json', JSON.stringify(predata, null, 4));
    };

    console.log('OK')

    while (true) {
        let nowdata = [];
        let tasks = [];

        const courses = await helper.getCourseList(config.semester);
        for (let course of courses) {
            tasks.push((async () => {
                let courseTasks = [];
                const coursePredata = findCourse(predata, course.id);

                courseTasks.push((async () => {
                    course.files = await helper.getFileList(course.id);
                    await compareFiles(course.name, course.files, coursePredata.files);
                    await new Promise((resolve => { resolve() }));
                })());
                
                // courseTasks.push((async () => {
                //     course.discussions = await helper.getDiscussionList(course.id);
                //     await compareDiscussions(course.discussions, coursePredata.discussions);
                //     await new Promise((resolve => { resolve() }));
                // })());

                courseTasks.push((async () => {
                    course.notifications = await helper.getNotificationList(course.id);
                    await compareNotifications(course.name, course.notifications, coursePredata.notifications);
                    await new Promise((resolve => { resolve() }));
                })());

                courseTasks.push((async () => {
                    course.homeworks = await helper.getHomeworkList(course.id);
                    await compareHomeworks(course.name, course.homeworks, coursePredata.homeworks);
                    await new Promise((resolve => { resolve() }));
                })());

                // courseTasks.push((async () => {
                //     course.questions = await helper.getAnsweredQuestionList(course.id);
                //     await compareQuestions(course.questions, coursePredata.questions);
                //     await new Promise((resolve => { resolve() }));
                // })());

                await Promise.all(courseTasks);

                await new Promise((resolve => {
                    nowdata.push(course);
                    console.log(course.name)
                    resolve();
                }));
            })());
        };

        await Promise.all(tasks);
        fs.writeFileSync('data.json', JSON.stringify(nowdata, null, 4));
        predata = nowdata;
        console.log('OK');
        await delay(20 * 1000);
    }
})();

