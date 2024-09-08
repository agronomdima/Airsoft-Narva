const express = require('express');
const app = express();
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const {pool, postUser, isTeamOverLimit, createTableIfNotExists} = require('./db')
require('dotenv').config();
const landingConfig = require('./landing-config.json');
const eventConfig = require('./event-config.json');
const { sendMail } = require('./mail-service');
const port = process.env.SERVER_PORT || 3000;

// Установка EJS как шаблонизатора
app.set('view engine', 'ejs');

// Настройка ejs-layouts как middleware
app.use(expressLayouts);

// Статические файлы
app.use(express.static('public'));

// Middleware для обработки JSON и URL-кодированных данных
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function checkTeam () {
    const team1 = '4gear';
    const team2 = 'farmacempentic';

    const isTeam1OverLimit = await isTeamOverLimit(team1);
    const isTeam2OverLimit = await isTeamOverLimit(team2);

    if (isTeam1OverLimit) {
        return team1
    } else if (isTeam2OverLimit) {
        return team2
    } else {
        return ''
    }
}

app.get('/', (req, res) => {
    res.render('pages/index', { layout: 'layouts/main', config: landingConfig });
});


app.get('/event', async (req, res) => {
    try {
        const restrictedTeam = await checkTeam();
        res.render('pages/event', { layout: 'layouts/main', restrictedTeam: restrictedTeam, config: eventConfig });
    } catch (e) {
        console.error('Error in checkTeam:', e);
        res.status(500).send('Internal Server Error');
    }
});

// Обработка POST-запроса
app.post('/submit-event-form', async (req, res) => {
    const {name, phone, email, age, nickname, aboutCharacter, team, honeypot} = req.body;

    if (honeypot) {
        return res.status(400).send('Spam detected');
    }

    try {
        const result = await pool.query(
            'INSERT INTO object3_reg(name, phone, email, age, nickname, about_character, team) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [name, phone, email, age, nickname, aboutCharacter, team]
        );
        const uniqueNumber = result.rows[0].id;
        console.log('inserted to db and got id')

        const mailOptions = {
            from: {
                name: "Narva CQB Arena",
                address: process.env.MAIL_USER,
            },
            to: ["dmitripersitski@gmail.com", email],
            subject: `Вы зарегистрировались на ${eventConfig["event-title"]}`,
            text: `
                Привет. Ты зарегистрировался на игру "${eventConfig["event-title"]}". Смотри обновления в наших соц сетях. Просим оплатить счет в течении 5 дней по этому счету, указав свой уникальный номер:
                Ваш номер: ${uniqueNumber}
                (счет)
            `,

        }
        await sendMail(mailOptions)
        console.log('email sent')

        res.status(200).send('Все сделано');
    } catch (error) {
        if (error.code === '23505') {
            res.status(409).send('Емайл уже зарегистрирован');
        } else {
            console.error(error);
            res.status(500).send('Ошибка при заполнении даты');
        }
    }
});



async function startApp() {
    await createTableIfNotExists();
    // Здесь запускается сервер
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

startApp();
