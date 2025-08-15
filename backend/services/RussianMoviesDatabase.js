// Локальная база данных русских фильмов и сериалов
class RussianMoviesDatabase {
    constructor() {
        this.movies = new Map();
        this.series = new Map();
        this.initializeDatabase();
    }

    // Инициализация базы данных
    initializeDatabase() {
        // Популярные русские фильмы
        this.addMovie({
            id: 'russian_001',
            title: 'Брат',
            original_title: 'Брат',
            year: 1997,
            director: 'Алексей Балабанов',
            cast: ['Сергей Бодров мл.', 'Виктор Сухоруков', 'Светлана Письмиченко'],
            genres: ['драма', 'криминал'],
            overview: 'Дембель Данила Багров возвращается домой в провинциальный городок. Его брат Виктор работает в милиции и просит Данилу помочь разобраться с местными бандитами.',
            rating: 8.1,
            runtime: 100,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_002',
            title: 'Брат 2',
            original_title: 'Брат 2',
            year: 2000,
            director: 'Алексей Балабанов',
            cast: ['Сергей Бодров мл.', 'Виктор Сухоруков', 'Ирина Салтыкова'],
            genres: ['драма', 'криминал', 'боевик'],
            overview: 'Данила Багров отправляется в Америку, чтобы помочь брату Виктору, который оказался в сложной ситуации.',
            rating: 7.8,
            runtime: 127,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_003',
            title: 'Левиафан',
            original_title: 'Левиафан',
            year: 2014,
            director: 'Андрей Звягинцев',
            cast: ['Алексей Серебряков', 'Елена Лядова', 'Владимир Вдовиченков'],
            genres: ['драма'],
            overview: 'В небольшом приморском городке на севере России живет Николай, который пытается отстоять свой дом перед коррумпированным мэром.',
            rating: 7.4,
            runtime: 140,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_004',
            title: 'Возвращение',
            original_title: 'Возвращение',
            year: 2003,
            director: 'Андрей Звягинцев',
            cast: ['Владимир Гарин', 'Иван Добронравов', 'Константин Лавроненко'],
            genres: ['драма'],
            overview: 'Два брата, Андрей и Иван, встречают отца, который неожиданно вернулся после 12-летнего отсутствия.',
            rating: 7.9,
            runtime: 105,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_005',
            title: 'Сталкер',
            original_title: 'Сталкер',
            year: 1979,
            director: 'Андрей Тарковский',
            cast: ['Александр Кайдановский', 'Анатолий Солоницын', 'Николай Гринько'],
            genres: ['драма', 'фантастика'],
            overview: 'В запретной Зоне, где исполняются самые сокровенные желания, работает проводник Сталкер.',
            rating: 8.1,
            runtime: 162,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_006',
            title: 'Андрей Рублев',
            original_title: 'Андрей Рублев',
            year: 1966,
            director: 'Андрей Тарковский',
            cast: ['Анатолий Солоницын', 'Иван Лапиков', 'Николай Гринько'],
            genres: ['драма', 'история'],
            overview: 'Фильм рассказывает о жизни и творчестве великого русского иконописца Андрея Рублева.',
            rating: 8.1,
            runtime: 205,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_007',
            title: 'Ирония судьбы, или С легким паром!',
            original_title: 'Ирония судьбы, или С легким паром!',
            year: 1975,
            director: 'Эльдар Рязанов',
            cast: ['Андрей Мягков', 'Барбара Брыльска', 'Юрий Яковлев'],
            genres: ['комедия', 'мелодрама'],
            overview: 'В новогоднюю ночь Женя Лукашин по ошибке попадает в чужую квартиру в Ленинграде.',
            rating: 8.1,
            runtime: 184,
            is_russian: true,
            type: 'movie'
        });

        this.addMovie({
            id: 'russian_008',
            title: 'Москва слезам не верит',
            original_title: 'Москва слезам не верит',
            year: 1979,
            director: 'Владимир Меньшов',
            cast: ['Вера Алентова', 'Ирина Муравьева', 'Раиса Рязанова'],
            genres: ['драма', 'мелодрама'],
            overview: 'История трех подруг, приехавших в Москву в 1958 году в поисках счастья.',
            rating: 8.0,
            runtime: 150,
            is_russian: true,
            type: 'movie'
        });

        // Популярные русские сериалы
        this.addSeries({
            id: 'russian_series_001',
            title: 'Ликвидация',
            original_title: 'Ликвидация',
            year: 2007,
            director: 'Сергей Урсуляк',
            cast: ['Владимир Машков', 'Андрей Смоляков', 'Сергей Маковецкий'],
            genres: ['драма', 'криминал', 'история'],
            overview: 'Действие происходит в Одессе 1946 года. Полковник милиции Давид Гоцман ведет борьбу с бандитизмом в послевоенном городе.',
            rating: 8.8,
            episodes: 12,
            is_russian: true,
            type: 'series'
        });

        this.addSeries({
            id: 'russian_series_002',
            title: 'Бригада',
            original_title: 'Бригада',
            year: 2002,
            director: 'Алексей Сидоров',
            cast: ['Сергей Безруков', 'Дмитрий Дюжев', 'Владимир Вдовиченков'],
            genres: ['драма', 'криминал'],
            overview: 'История четырех друзей детства, которые в перестроечные годы создают свою криминальную группировку.',
            rating: 8.2,
            episodes: 15,
            is_russian: true,
            type: 'series'
        });

        this.addSeries({
            id: 'russian_series_003',
            title: 'Улицы разбитых фонарей',
            original_title: 'Улицы разбитых фонарей',
            year: 1998,
            director: 'Александр Рогожкин',
            cast: ['Александр Половцев', 'Сергей Селин', 'Анна Ковальчук'],
            genres: ['драма', 'криминал', 'детектив'],
            overview: 'Сериал о буднях сотрудников милиции Санкт-Петербурга.',
            rating: 7.8,
            episodes: 20,
            is_russian: true,
            type: 'series'
        });

        this.addSeries({
            id: 'russian_series_004',
            title: 'Глухарь',
            original_title: 'Глухарь',
            year: 2008,
            director: 'Тимур Алпатов',
            cast: ['Максим Аверин', 'Денис Рожков', 'Елена Морозова'],
            genres: ['драма', 'криминал', 'детектив'],
            overview: 'Сериал о работе следователей московской милиции.',
            rating: 8.0,
            episodes: 16,
            is_russian: true,
            type: 'series'
        });

        this.addSeries({
            id: 'russian_series_005',
            title: 'Интерны',
            original_title: 'Интерны',
            year: 2010,
            director: 'Максим Пежемский',
            cast: ['Иван Охлобыстин', 'Дмитрий Шаракоис', 'Кристина Асмус'],
            genres: ['комедия', 'драма'],
            overview: 'Сериал о жизни молодых врачей-интернов в больнице.',
            rating: 7.5,
            episodes: 20,
            is_russian: true,
            type: 'series'
        });

        console.log(`📊 База данных инициализирована: ${this.movies.size} фильмов, ${this.series.size} сериалов`);
    }

    // Добавление фильма в базу
    addMovie(movie) {
        this.movies.set(movie.id, movie);
    }

    // Добавление сериала в базу
    addSeries(series) {
        this.series.set(series.id, series);
    }

    // Поиск по названию
    search(query, year = null) {
        query = query.toLowerCase().trim();
        const results = [];

        // Поиск в фильмах
        for (const movie of this.movies.values()) {
            if (this.matchesSearch(movie, query, year)) {
                results.push(movie);
            }
        }

        // Поиск в сериалах
        for (const series of this.series.values()) {
            if (this.matchesSearch(series, query, year)) {
                results.push(series);
            }
        }

        // Сортируем по релевантности
        results.sort((a, b) => {
            // Приоритет точному совпадению в названии
            const aExact = a.title.toLowerCase() === query || a.original_title.toLowerCase() === query;
            const bExact = b.title.toLowerCase() === query || b.original_title.toLowerCase() === query;
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Затем по рейтингу
            return (b.rating || 0) - (a.rating || 0);
        });

        return results;
    }

    // Проверка соответствия поисковому запросу
    matchesSearch(item, query, year) {
        const titleMatch = item.title.toLowerCase().includes(query) || 
                          item.original_title.toLowerCase().includes(query);
        
        const yearMatch = !year || item.year === year;
        
        return titleMatch && yearMatch;
    }

    // Поиск по ID
    getById(id) {
        return this.movies.get(id) || this.series.get(id);
    }

    // Получение всех фильмов
    getAllMovies() {
        return Array.from(this.movies.values());
    }

    // Получение всех сериалов
    getAllSeries() {
        return Array.from(this.series.values());
    }

    // Получение статистики
    getStats() {
        return {
            totalMovies: this.movies.size,
            totalSeries: this.series.size,
            totalItems: this.movies.size + this.series.size
        };
    }

    // Добавление пользовательского фильма/сериала
    addCustomItem(item) {
        if (item.type === 'movie') {
            this.addMovie(item);
        } else if (item.type === 'series') {
            this.addSeries(item);
        }
    }
}

module.exports = new RussianMoviesDatabase();