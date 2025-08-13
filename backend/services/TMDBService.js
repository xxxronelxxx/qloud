const axios = require('axios');

class TMDBService {
    constructor() {
        // TMDB API ключ (можно получить на https://www.themoviedb.org/settings/api)
        this.apiKey = process.env.TMDB_API_KEY || 'your_tmdb_api_key_here';
        this.baseURL = 'https://api.themoviedb.org/3';
        
        // Кэш для результатов поиска
        this.cache = new Map();
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа
    }

    // Поиск фильма по названию
    async searchMovie(query, year = null) {
        try {
            const cacheKey = `movie_${query}_${year}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            const params = {
                api_key: this.apiKey,
                query: query,
                language: 'ru-RU',
                include_adult: false
            };

            if (year) {
                params.year = year;
            }

            const response = await axios.get(`${this.baseURL}/search/movie`, { params });
            
            if (response.data.results && response.data.results.length > 0) {
                const movie = response.data.results[0];
                const result = {
                    id: movie.id,
                    title: movie.title,
                    original_title: movie.original_title,
                    year: new Date(movie.release_date).getFullYear(),
                    rating: movie.vote_average,
                    overview: movie.overview,
                    genres: movie.genre_ids, // ID жанров
                    poster_path: movie.poster_path,
                    backdrop_path: movie.backdrop_path
                };

                // Кэшируем результат
                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return result;
            }

            return null;
        } catch (error) {
            console.error('TMDB API Error:', error.message);
            return null;
        }
    }

    // Получение детальной информации о фильме
    async getMovieDetails(movieId) {
        try {
            const cacheKey = `movie_details_${movieId}`;
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            const params = {
                api_key: this.apiKey,
                language: 'ru-RU',
                append_to_response: 'credits,genres'
            };

            const response = await axios.get(`${this.baseURL}/movie/${movieId}`, { params });
            const movie = response.data;

            const result = {
                id: movie.id,
                title: movie.title,
                original_title: movie.original_title,
                year: new Date(movie.release_date).getFullYear(),
                rating: movie.vote_average,
                overview: movie.overview,
                genres: movie.genres.map(g => g.name),
                runtime: movie.runtime,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                director: movie.credits?.crew?.find(c => c.job === 'Director')?.name,
                cast: movie.credits?.cast?.slice(0, 5).map(a => a.name)
            };

            // Кэшируем результат
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('TMDB API Error:', error.message);
            return null;
        }
    }

    // Получение жанров
    async getGenres() {
        try {
            const cacheKey = 'genres';
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }

            const params = {
                api_key: this.apiKey,
                language: 'ru-RU'
            };

            const response = await axios.get(`${this.baseURL}/genre/movie/list`, { params });
            
            // Кэшируем результат
            this.cache.set(cacheKey, {
                data: response.data.genres,
                timestamp: Date.now()
            });

            return response.data.genres;
        } catch (error) {
            console.error('TMDB API Error:', error.message);
            return [];
        }
    }

    // Очистка кэша
    clearCache() {
        this.cache.clear();
    }

    // Получение размера кэша
    getCacheSize() {
        return this.cache.size;
    }
}

module.exports = new TMDBService();