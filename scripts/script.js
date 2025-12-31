import { apiKey } from './config.js';

const formElement = document.querySelector('.weather__form');
const inputElement = document.querySelector('.weather__input');
const gpsButton = document.querySelector('.weather__gps-button');
const suggestionsElement = document.querySelector('.weather__suggestions-list')
const errorElement = document.querySelector('.weather__error');
const timeElement = document.querySelector('.weather__date');
const cityElement = document.querySelector('.weather__city');
const tempElement = document.querySelector('.weather__temperature');
const descriptionElement = document.querySelector('.weather__description');
const updateTimeElement = document.querySelector('.weather__update-time');
const updateButton = document.querySelector('.weather__update-button');
const extraElementList = document.querySelector('.weather__extra-info-list');
const hourlyButton = document.querySelector('.weather__button-hourly');
const dailyButton = document.querySelector('.weather__button-daily');
const weatherContainer = document.querySelector('.weather__forward');
const iconMapping = {
    "01d": "clear-day",
    "02d": "partly-cloudy-day",
    "03d": "cloudy",
    "04d": "cloudy",
    "09d": "rain",
    "10d": "rain",
    "11d": "thunderstorms-day-rain",
    "13d": "snow",
    "50d": "mist",

    "01n": "clear-night",
    "02n": "partly-cloudy-night",
    "03n": "cloudy",
    "04n": "cloudy",
    "09n": "rain",
    "10n": "rain",
    "11n": "thunderstorms-night-rain",
    "13n": "snow",
    "50n": "mist"
};

let ui = {
    loading: false,
}

let current = {
    city: null,
    temperature: null,
    timestamp: null,
    extra: {
        description: null,
        humidity: null,
        pressure: null,
        windSpeed: null,
        feelsLike: null,
    },
    lastFetchTime: null,
}

let rawForecastData = [];
let currentTimezoneOffset = 0;
let activeDayIndex = null;

const getWeatherIconPath = (iconCode) => {
    const fileName = iconMapping[iconCode] || "clear-day";
    return `./icon/animated/${fileName}.svg`;
};

const clearUI = () => {
    weatherContainer.innerHTML = '';
    extraElementList.innerHTML = '';
    tempElement.textContent = '--°';
    cityElement.textContent = 'Загрузка...';
};

const getDailyForecast = () => {
    if (!rawForecastData || rawForecastData.length === 0) return [];

    const daysMap = {};

    rawForecastData.forEach(item => {
        const itemDate = new Date((item.dt + currentTimezoneOffset) * 1000);
        const dayKey = itemDate.toISOString().split('T')[0];

        if (!daysMap[dayKey]) {
            daysMap[dayKey] = [];
        }
        daysMap[dayKey].push(item);
    });

    const allDays = Object.keys(daysMap).sort();
    const forecastDays = allDays.slice(-5);

    return forecastDays.map(dayKey => {
        const points = daysMap[dayKey];

        let dayData = points.find(p => {
            const h = new Date((p.dt + currentTimezoneOffset) * 1000).getUTCHours();
            return h >= 11 && h <= 16;
        }) || points[0];

        let nightData = points.find(p => {
            const h = new Date((p.dt + currentTimezoneOffset) * 1000).getUTCHours();
            return h >= 0 && h <= 5;
        }) || points[points.length - 1];

        const dateObj = new Date((dayData.dt + currentTimezoneOffset) * 1000);
        const dayName = dateObj.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' });
        const dayNum = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

        return {
            date: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dayNum}`,
            dayTemp: Math.round(dayData.main.temp) + '°',
            nightTemp: Math.round(nightData.main.temp) + '°',
            dayIcon: dayData.weather[0].icon,
            nightIcon: nightData.weather[0].icon,
            feelsLike: Math.round(dayData.main.feels_like) + '°',
            humidity: dayData.main.humidity + ' %',
            windSpeed: Math.round(dayData.wind.speed) + ' м/с',
            pressure: Math.round(dayData.main.pressure * 0.75006) + ' мм.рт.ст.',
            description: dayData.weather[0].description.charAt(0).toUpperCase() + dayData.weather[0].description.slice(1)
        };
    });
};

const getHourlyForecast = () => {
    if (!rawForecastData || rawForecastData.length === 0) return [];

    return rawForecastData.slice(0, 5).map(item => {
        const localTime = new Date((item.dt + currentTimezoneOffset) * 1000);
        const hours = localTime.getUTCHours().toString().padStart(2, '0');

        return {
            date: `${hours}:00`,
            dayTemp: Math.round(item.main.temp) + '°',
            nightTemp: '',
            dayIcon: item.weather[0].icon,
            nightIcon: ''
        };
    })
}

const loadWeather = async (params) => {
    try {
        ui.loading = true;
        inputElement.classList.add('is-loading');
        showError('');

        const isCoords = typeof params === 'object';
        const currentWeatherPromise = loadCurrentWeather(params, isCoords);
        const forecastPromise = loadForecast(params, isCoords);

        await Promise.all([currentWeatherPromise, forecastPromise]);

        if (!isCoords) {
            localStorage.setItem('lastcity', params);
            inputElement.blur();
            inputElement.value = '';
        }

    } catch (error) {
        console.error('Ошибка:', error);

        if (error.message.includes('404')) {
            showError('Город не найден. Попробуйте ввести название точнее');
        } else {
            showError('Не удалось загрузить данные. Проверьте соединение');
        }

        if (current.city) {
            cityElement.textContent = current.city;
        }
    } finally {
        ui.loading = false;
        inputElement.classList.remove('is-loading');
    }
}

const validateAndSearch = () => {
    const city = inputElement.value.trim().replace(/\s+/g, ' ');

    renderSuggestions([]);
    debouncedSuggestions.cancel();

    if (city.length === 0) {
        showError('');
        return;
    };
    if (city.length < 3) {
        showError('Введите не менее 3 символов для поиска');
        return;
    };

    showError('');
    loadWeather(city);
}

const createDebounce = (fn, delay) => {
    let timerId;
    const debounced = function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
    debounced.cancel = () => clearTimeout(timerId);
    return debounced;
}

const debouncedSearch = createDebounce(validateAndSearch, 800);

const loadCurrentWeather = async (params, isCoords) => {
    const query = isCoords
        ? `lat=${params.lat}&lon=${params.lon}`
        : `q=${params}`;

    const url = `https://api.openweathermap.org/data/2.5/weather?${query}&appid=${apiKey}&units=metric&lang=ru`;

    const response = await fetch(url);

    if (!response.ok) throw new Error(`Http error: ${response.status}`);

    const data = await response.json();

    const { name, dt, main, weather, wind } = data;
    const { temp, humidity, pressure, feels_like } = main;
    const { description, icon } = weather[0];
    const { speed } = wind;

    current.city = name;
    current.temperature = temp;
    current.timestamp = dt;

    const date = new Date(current.timestamp * 1000);
    const formattedDate = date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'short',
    })
    const formattedWeekday = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    timeElement.textContent = formattedWeekday;
    timeElement.setAttribute('datetime', date.toISOString());

    cityElement.textContent = current.city;
    const customIconPath = getWeatherIconPath(icon);
    tempElement.innerHTML = `
    <span class="weather__temperature-value">${Math.round(current.temperature) + '°'}</span>
    <img class="weather__temperature-icon" src="${customIconPath}" alt="weather">
    `

    current.extra = {
        description: description.charAt(0).toUpperCase() + description.slice(1),
        humidity,
        pressure: Math.round(pressure * 0.75006),
        windSpeed: Math.round(speed),
        feelsLike: Math.round(feels_like)
    };

    extraElementList.innerHTML = `
    <li class="weather__extra-info-item">Ощущается как: ${current.extra.feelsLike}°</li>
        <li class="weather__extra-info-item">Влажность: ${current.extra.humidity} %</li>
        <li class="weather__extra-info-item">Давление: ${current.extra.pressure} мм.рт.ст.</li>
        <li class="weather__extra-info-item">Скорость ветра: ${current.extra.windSpeed} м/с</li>`
    descriptionElement.textContent = `${current.extra.description}`;

    current.lastFetchTime = Date.now();

    updateRelativeTime();

    localStorage.setItem('lastcity', name);
}

const loadForecast = async (params, isCoords) => {
    activeDayIndex = null;
    const query = isCoords ? `lat=${params.lat}&lon=${params.lon}` : `q=${params}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${query}&appid=${apiKey}&units=metric&lang=ru`;

    const response = await fetch(forecastUrl);
    if (!response.ok) throw new Error(`Http error: ${response.status}`);
    const data = await response.json();

    rawForecastData = data.list;
    currentTimezoneOffset = data.city.timezone;


    dailyButton.classList.add('is-active');
    hourlyButton.classList.remove('is-active');

    const dailyData = getDailyForecast();

    renderForecast(dailyData);
};

const handleGeolocation = () => {
    if (!navigator.geolocation) {
        showError("Геолокация не поддерживается вашим браузером");
        return;
    }

    cityElement.textContent = "Ищем твое местоположение";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude: lat, longitude: lon } = position.coords;
            loadWeather({ lat, lon });
        },
        (error) => {
            console.error(error);
            showError("Не удалось получить доступ к местоположению");
            cityElement.textContent = "Ошибка GPS";
        }
    );
};

const renderForecast = forecast => {
    weatherContainer.style.opacity = '0';
    weatherContainer.style.transition = 'opacity 0.2s ease';
    weatherContainer.style.pointerEvents = 'none';

    setTimeout(() => {
        weatherContainer.innerHTML = '';

        if (activeDayIndex !== null) {
            hourlyButton.classList.add('is-disabled');
            dailyButton.classList.add('is-disabled');
        } else {
            hourlyButton.classList.remove('is-disabled');
            dailyButton.classList.remove('is-disabled');
        }

        if (activeDayIndex !== null && forecast[activeDayIndex]) {
            const item = forecast[activeDayIndex];
            const detailedDiv = document.createElement('div');
            detailedDiv.className = 'weather__detailed detailed';

            detailedDiv.innerHTML = `
                <div class="detailed__header">
                  <span class="detailed__date">${item.date}</span>
                  <button class="detailed__button">← Назад</button>
                </div>
                <div class="detailed__body">
                  <div class="detailed__data">
                    <div class="detailed__data-wrapper">
                       <span class="detailed__temp">${item.dayTemp}</span>
                       <img class="detailed__icon" src="${getWeatherIconPath(item.dayIcon)}" alt="day">
                    </div>
                    <span class="detailed__desc">${item.description}</span>
                  </div>
                  <div class="detailed__info">
                    <ul class="detailed__info-list">
                      <li>Ощущается как: ${item.feelsLike}</li>
                      <li>Влажность: ${item.humidity}</li>
                      <li>Давление: ${item.pressure}</li>
                      <li>Скорость ветра: ${item.windSpeed}</li>
                    </ul>
                  </div>
                </div>
            `;
            weatherContainer.append(detailedDiv);
        } else {
            const list = document.createElement('ul');
            list.className = hourlyButton.classList.contains('is-active')
                ? 'weather__forward-list is-hourly'
                : 'weather__forward-list';

            forecast.forEach((day, index) => {
                const forecastItem = document.createElement('li');
                forecastItem.className = 'weather__forward-item';
                forecastItem.dataset.index = index;

                const dayIconPath = getWeatherIconPath(day.dayIcon);
                const nightIconPath = day.nightIcon ? getWeatherIconPath(day.nightIcon) : '';

                forecastItem.innerHTML = `
                    <span class="weather__forward-date">${day.date}</span>
                    <div class="weather__forward-weather-box">
                        <div class="weather__forward-temp-group">
                            <img class="weather__forward-icon" src="${dayIconPath}" alt="day">
                            <span class="weather__forward-temp">${day.dayTemp}</span>
                        </div>
                        ${day.nightIcon ? `
                        <div class="weather__forward-temp-group is-night">
                            <img class="weather__forward-icon" src="${nightIconPath}" alt="night">
                            <span class="weather__forward-temp">${day.nightTemp}</span>
                        </div>` : ''}
                    </div>
                `;
                list.append(forecastItem);
            });
            weatherContainer.append(list);
        }

        weatherContainer.style.opacity = '1';
        weatherContainer.style.pointerEvents = 'auto';
    }, 120); 
};

const showError = (message) => {
    errorElement.textContent = message;
    if (message) {
        inputElement.setAttribute('aria-invalid', 'true');
    } else {
        inputElement.removeAttribute('aria-invalid');
    }
}

const updateRelativeTime = () => {
    if (!current.lastFetchTime) return;

    const updateAgo = Math.floor((Date.now() - current.lastFetchTime) / 1000 / 60);

    if (updateAgo < 1) {
        updateTimeElement.textContent = 'обновлено менее мин назад';
    } else {
        updateTimeElement.textContent = `обновлено ${updateAgo} мин назад`
    }
}

const getCitySuggestions = async query => {
    if (query.length < 3) return [];

    const suggestionsUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${query}&limit=10&appid=${apiKey}`;

    try {
        const response = await fetch(suggestionsUrl);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        return [];
    }
}

const renderSuggestions = suggestions => {
    suggestionsElement.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
        suggestionsElement.classList.remove('is-active');
        return;
    }

    const seenNames = new Set();
    let count = 0;

    suggestions.forEach(city => {
        if (count >= 5) return;

        const { country, state, local_names, name } = city;
        const displayName = (local_names && local_names.ru) ? local_names.ru : name;

        const uniqueKey = `${displayName}-${state || ''}-${country}`.toLowerCase();

        if (seenNames.has(uniqueKey)) return;
        seenNames.add(uniqueKey);

        const suggestionsItem = document.createElement('li');
        suggestionsItem.classList.add('weather__suggestions-item');

        const locationParts = [displayName];
        if (state) locationParts.push(state);
        locationParts.push(country);

        suggestionsItem.textContent = locationParts.join(', ');
        suggestionsElement.append(suggestionsItem);

        count++;
    });

    if (count > 0) {
        suggestionsElement.classList.add('is-active');
    } else {
        suggestionsElement.classList.remove('is-active');
    }
}

const debouncedSuggestions = createDebounce(async (query) => {
    const suggestions = await getCitySuggestions(query);

    const sortedSuggestions = suggestions.sort((a, b) => {
        if (a.country === 'RU' && b.country !== 'RU') return -1;
        if (a.country !== 'RU' && b.country === 'RU') return 1;
        return 0;
    });

    renderSuggestions(sortedSuggestions);
}, 300);

inputElement.addEventListener('input', event => {
    const value = event.target.value.trim();

    if (value.length === 0) {
        showError('');
        renderSuggestions([]);
        debouncedSuggestions.cancel();
    } else {
        debouncedSuggestions(value);
    }
});

inputElement.addEventListener('blur', () => {
    const value = inputElement.value.trim();

    if (value.length < 2) {
        showError('');
        debouncedSearch.cancel();
    }
});

suggestionsElement.addEventListener('click', event => {
    const target = event.target.closest('.weather__suggestions-item');
    if (!target) return;

    event.stopPropagation();

    const cityName = target.textContent.split(',')[0].trim();

    loadWeather(cityName);
    renderSuggestions([]);

    inputElement.blur();
    inputElement.value = '';
});

document.addEventListener('click', event => {
    if (!event.target.closest('.weather__search')) {

        renderSuggestions([]);
        showError('');
        inputElement.blur();
    }
});

gpsButton.addEventListener('click', handleGeolocation);

updateButton.addEventListener('click', () => {
    if (current.city) {
        loadWeather(current.city)
    } else {
        const savedCity = localStorage.getItem('lastcity') || 'Москва';
        loadWeather(savedCity);
    }
});

formElement.addEventListener('submit', event => {
    event.preventDefault();

    validateAndSearch();
});

hourlyButton.addEventListener('click', () => {
    dailyButton.classList.remove('is-active');
    hourlyButton.classList.add('is-active');

    const hourlyData = getHourlyForecast();
    renderForecast(hourlyData);
});

dailyButton.addEventListener('click', () => {
    hourlyButton.classList.remove('is-active');
    dailyButton.classList.add('is-active');

    const dailyData = getDailyForecast();
    renderForecast(dailyData);
});

weatherContainer.addEventListener('click', event => {
    const card = event.target.closest('.weather__forward-item');
    const backBtn = event.target.closest('.detailed__button');

    if (backBtn) {
        activeDayIndex = null;
        const data = hourlyButton.classList.contains('is-active') ? getHourlyForecast() : getDailyForecast();
        renderForecast(data);
        return;
    }

    if (card && activeDayIndex === null) {
        if (hourlyButton.classList.contains('is-active')) {
            return;
        }

        activeDayIndex = parseInt(card.dataset.index);
        const data = getDailyForecast();
        renderForecast(data);
    }
});

setInterval(updateRelativeTime, 60000);

const savedCity = localStorage.getItem('lastcity') || 'Москва';
loadWeather(savedCity);