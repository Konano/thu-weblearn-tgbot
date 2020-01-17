const Telegraf = require('telegraf');
const _ = require('lodash');
const fs = require('fs');
const htmlToText = require('html-to-text');
const SocksAgent = require('socks5-https-client/lib/Agent');
const thuLearnLib = require('thu-learn-lib');
const ContentType = require('thu-learn-lib/lib/types');
const moment = require('moment');

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
    console.log(`Ooops, encountered an error for ${ctx.updateType}`, err)
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

async function compareFiles(courseName, nowdata, predata) {
    nowdata.forEach(file => {
        if (predata.filter(x => { return file.id == x.id }).length == 0) {
            bot.telegram.sendMessage(config.channel, 
                `「${courseName}」发布了新的文件：` + 
                `[${file.title}](${file.downloadUrl.replace(/learn2018/, 'learn')})`,
                { parse_mode : 'Markdown' });
        }
    });
}

async function compareHomeworks(courseName, nowdata, predata) {
    nowdata.forEach(homework => {
        const pre = predata.filter(x => { return homework.id == x.id });
        if (pre.length == 0) {
            bot.telegram.sendMessage(config.channel, 
                `「${courseName}」布置了新的作业：` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, 'learn')})\n` + 
                `截止日期：${moment(homework.deadline).format('YYYY-MM-DD HH:mm:ss')}`,
                { parse_mode : 'Markdown' });
            return;
        }
        if (homework.submitted && !pre[0].submitted) {
            bot.telegram.sendMessage(config.channel, 
                `已提交作业：「${courseName}」` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, 'learn')})\n`,
                { parse_mode : 'Markdown' });
        }
        if (homework.gradeTime && (pre[0].gradeTime == undefined || 
                homework.gradeTime.toISOString() != (typeof pre[0].gradeTime == 'string' ? pre[0].gradeTime : pre[0].gradeTime.toISOString()))) {
            let content = 
                `作业有新的评分：「${courseName}」` + 
                `[${homework.title}](${homework.url.replace(/learn2018/, 'learn')})\n`;
            if (homework.gradeLevel)
                content += `分数等级：${homework.gradeLevel}\n`
            else if (homework.grade)
                content += `分数：${homework.grade}\n`
            if (homework.gradeContent)
                content += `====================\n` + `${homework.gradeContent}`
            bot.telegram.sendMessage(config.channel, content, { parse_mode : 'Markdown' });
        }
    });
}

async function compareNotifications(courseName, nowdata, predata) {
    nowdata.forEach(notification => {
        if (predata.filter(x => { return notification.id == x.id }).length == 0) {
            bot.telegram.sendMessage(config.channel, 
                `「${courseName}」发布了新的公告：` + 
                `[${notification.title}](${notification.url.replace(/learn2018/, 'learn')})\n` +
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
        predata = await JSON.parse(fs.readFileSync('data.json', 'utf8'));
    } catch (error) {
        let tasks = [];
        const courses = (await helper.getCourseList(config.semester)).concat(await helper.getCourseList('2019-2020-1'));
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
        await delay(60 * 1000);
        let nowdata = [];
        let tasks = [];
        const courses = (await helper.getCourseList(config.semester)).concat(await helper.getCourseList('2019-2020-1'))
        for (let course of courses) {
            tasks.push((async () => {
                course.files = await helper.getFileList(course.id);
                // course.discussions = await helper.getDiscussionList(course.id);
                course.notifications = await helper.getNotificationList(course.id);
                course.homeworks = await helper.getHomeworkList(course.id);
                // course.questions = await helper.getAnsweredQuestionList(course.id);

                const coursePredata = findCourse(predata, course.id);
                if (coursePredata != null) {
                    await compareFiles(course.name, course.files, coursePredata.files);
                    // await compareDiscussions(course.discussions, coursePredata.discussions);
                    await compareNotifications(course.name, course.notifications, coursePredata.notifications);
                    await compareHomeworks(course.name, course.homeworks, coursePredata.homeworks);
                    // await compareQuestions(course.questions, coursePredata.questions);
                } else {
                    bot.telegram.sendMessage(config.channel, `新课程：「${course.name}」`);
                }
                
                await new Promise((resolve => {
                    nowdata.push(course);
                    console.log(course.name);
                    resolve();
                }));
            })());
        };

        await Promise.all(tasks);
        fs.writeFileSync('data.json', JSON.stringify(nowdata, null, 4));
        predata = nowdata;
        // console.log('OK');
    }
})();

