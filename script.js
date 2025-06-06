const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const IPEauditories = ["502-2 к.", "601-2 к.", "603-2 к.", "604-2 к.", "605-2 к.", "607-2 к.", "611-2 к.", "613-2 к.", "615-2 к."];

// Порядок временных интервалов для сортировки
const timeSlotsOrder = [
    "09:00—10:20",
    "10:35—11:55",
    "12:25—13:45",
    "14:00—15:20",
    "15:50—17:10",
    "17:25—18:45",
    "19:00—20:20",
    "20:40—22:00"
];

// Глобальные переменные для хранения данных
let currentWeekNumber = null;
let teachersData = null;
let teacherSchedulesData = null;

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }
    return response.json();
}

async function loadInitialData() {
    document.getElementById('loading').style.display = 'block';
    try {
        // Загружаем текущую неделю
        currentWeekNumber = await fetchJson('https://iis.bsuir.by/api/v1/schedule/current-week');
        
        // Загружаем данные преподавателей
        const teachers = await fetchJson('https://iis.bsuir.by/api/v1/employees/all');
        teachersData = teachers;
        
        // Загружаем расписания преподавателей
        teacherSchedulesData = {};
        const promises = teachers.map(async (teacher) => {
            try {
                const schedule = await fetchJson(`https://iis.bsuir.by/api/v1/employees/schedule/${teacher.urlId}`);
                teacherSchedulesData[teacher.urlId] = schedule;
            } catch (error) {
                console.error(`Ошибка загрузки расписания для ${teacher.fio}:`, error);
                teacherSchedulesData[teacher.urlId] = { schedules: {}, previousSchedules: {} };
            }
        });
        
        await Promise.all(promises);
        
        // Устанавливаем текущую дату
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('datePicker').value = `${yyyy}-${mm}-${dd}`;
        
        // Обновляем отображение недели
        const dayName = dayNames[today.getDay()]; 
        document.getElementById('weekDisplay').textContent = `${today.toLocaleDateString()} (${dayName}), ${currentWeekNumber}-я учебная неделя 🗓️`;
        
        // Загружаем расписание для текущей даты
        await updateSchedule(today, currentWeekNumber);
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        alert('Произошла ошибка при загрузке данных');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function calculateWeekNumber(selectedDate) {
    if (!currentWeekNumber) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Находим понедельник текущей недели
    const getMonday = (date) => {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Понедельник - первый день
        return new Date(date.setDate(diff));
    };
    
    const currentMonday = getMonday(new Date(today));
    const selectedMonday = getMonday(new Date(selectedDate));
    
    // Разница в неделях между выбранной датой и текущей неделей
    const diffTime = selectedMonday - currentMonday;
    const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
    
    // Вычисляем номер недели с учётом 4-недельного цикла
    let weekNumber = ((currentWeekNumber - 1) + diffWeeks) % 4 + 1;
    return weekNumber <= 0 ? weekNumber + 4 : weekNumber;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

function timeInRange(start, end, target) {
    return start <= target && target <= end;
}

// Функция для определения, попадает ли время занятия в временной слот
function isTimeInSlot(lessonStart, lessonEnd, slotStart, slotEnd) {
    const lessonStartTime = convertToMinutes(lessonStart);
    const lessonEndTime = convertToMinutes(lessonEnd);
    const slotStartTime = convertToMinutes(slotStart);
    const slotEndTime = convertToMinutes(slotEnd);
    
    // Занятие считается относящимся к слоту, если оно пересекается с ним
    return (lessonStartTime < slotEndTime && lessonEndTime > slotStartTime);
}
//Занятия, выходящие за пределы стандартных слотов, отображались в ближайшем подходящем слоте. Это обеспечит более четкое распределение по слотам, где каждое занятие будет отображаться только в одном слоте - том, в котором оно начинается.
//function isTimeInSlot(lessonStart, lessonEnd, slotStart, slotEnd) {
  //  const lessonStartTime = convertToMinutes(lessonStart);
    //const lessonEndTime = convertToMinutes(lessonEnd);
    //const slotStartTime = convertToMinutes(slotStart);
    //const slotEndTime = convertToMinutes(slotEnd);
    
    // Занятие относится к слоту, если его начало попадает в этот слот
    //return (lessonStartTime >= slotStartTime && lessonStartTime < slotEndTime);
//}



// Вспомогательная функция для преобразования времени в минуты
function convertToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Модифицированная функция getScheduleForAuditory
async function getScheduleForAuditory(auditory, date, weekNumber) {
    const schedule = {};
    const dayName = dayNames[date.getDay()];
    
    if (!teachersData || !teacherSchedulesData) return schedule;

    for (const teacher of teachersData) {
        const teacherSchedule = teacherSchedulesData[teacher.urlId] || {};
        
        for (const scheduleType of ['schedules', 'previousSchedules']) {
            const daySchedule = teacherSchedule[scheduleType]?.[dayName] || [];
            
            for (const lesson of daySchedule) {
                const weekNumbers = lesson?.weekNumber || [];
                
                if (lesson.auditories && lesson.auditories.includes(auditory) && 
                    Array.isArray(weekNumbers) && weekNumbers.includes(weekNumber)) {
                    
                    const startDate = parseDate(lesson.startLessonDate);
                    const endDate = parseDate(lesson.endLessonDate);
                    const lessonDate = parseDate(lesson.dateLesson);
                    
                    if ((startDate && endDate && timeInRange(startDate, endDate, date)) || 
                        (lessonDate && date.toDateString() === lessonDate.toDateString())) {
                        
                        const lessonStartTime = lesson.startLessonTime;
                        const lessonEndTime = lesson.endLessonTime;
                        
                        // Находим все слоты, которые пересекаются с занятием
                        for (const timeSlot of timeSlotsOrder) {
                            const [slotStart, slotEnd] = timeSlot.split('—');
                            
                            if (isTimeInSlot(lessonStartTime, lessonEndTime, slotStart, slotEnd)) {
                                if (!schedule[timeSlot]) {
                                    schedule[timeSlot] = [];
                                }
                                schedule[timeSlot].push({
                                    subject: lesson.subject,
                                    type: lesson.lessonTypeAbbrev,
                                    teacher: teacher.fio,
                                    groups: lesson.studentGroups?.map(g => g.name) || [],
                                    startTime: lessonStartTime,
                                    endTime: lessonEndTime
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    return schedule;
}

async function updateSchedule(date, weekNumber) {
    if (!weekNumber) {
        console.error('Не удалось определить номер недели');
        return;
    }

    document.getElementById('loading').style.display = 'block';
    try {
        const schedulesContainer = document.getElementById('schedules');
        schedulesContainer.innerHTML = '';
        
        const promises = IPEauditories.map(async (auditory) => {
            const schedule = await getScheduleForAuditory(auditory, date, weekNumber);
            return { auditory, schedule };
        });
        
        const results = await Promise.all(promises);
        
        // Создаем контейнер для каждого временного слота
        for (const timeSlot of timeSlotsOrder) {
            const timeSlotContainer = document.createElement('div');
            timeSlotContainer.className = 'time-slot';
            
            // Добавляем заголовок временного интервала
            const timeHeader = document.createElement('div');
            timeHeader.className = 'time-header';
            timeHeader.textContent = timeSlot;
            timeSlotContainer.appendChild(timeHeader);
            
            // Добавляем аудитории и занятия для этого времени
            for (const result of results) {
                const lessons = result.schedule[timeSlot];
                if (lessons && lessons.length > 0) {
                    const audContainer = document.createElement('div');
                    audContainer.className = 'auditory';
                    audContainer.innerHTML = `${result.auditory}`;
                    
                    for (const lesson of lessons) {
                        const lessonDiv = document.createElement('div');
                        lessonDiv.className = 'lesson';
                        
                        // Формируем текст занятия с временем
                        const groupsText = lesson.groups.length > 0 
                            ? lesson.groups.map(g => 
                                `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="group-link">гр. ${g}</a>`
                              ).join(', ')
                            : 'нет группы';
                        
                        // Внутри функции updateSchedule, в части формирования lessonDiv:
lessonDiv.innerHTML = `
    <div class="lesson-time">${lesson.startTime}—${lesson.endTime}</div>
    <div class="lesson-content">
        ${lesson.subject} (${lesson.type})
        ${lesson.teacher}
        ${groupsText}
    </div>
`;
                        audContainer.appendChild(lessonDiv);
                    }
                    
                    timeSlotContainer.appendChild(audContainer);
                }
            }
            
            // Если есть занятия в этом временном слоте, добавляем в контейнер
            if (timeSlotContainer.children.length > 1) {
                schedulesContainer.appendChild(timeSlotContainer);
            }
        }
        
        // Добавляем аудитории без занятий
        const emptyAuditories = results.filter(r => Object.keys(r.schedule).length === 0);
        if (emptyAuditories.length > 0) {
            const emptyContainer = document.createElement('div');
            emptyContainer.className = 'empty-auditories';
            
            const emptyHeader = document.createElement('div');
            emptyHeader.className = 'empty-header';
            emptyHeader.textContent = 'Занятий нет';
            emptyContainer.appendChild(emptyHeader);
            
            for (const empty of emptyAuditories) {
                const audDiv = document.createElement('div');
                audDiv.className = 'auditory';
                audDiv.textContent = empty.auditory;
                emptyContainer.appendChild(audDiv);
            }
            
            schedulesContainer.appendChild(emptyContainer);
        }
    } catch (error) {
        console.error('Ошибка при обновлении расписания:', error);
        alert('Произошла ошибка при загрузке расписания');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function copyAndSend() {
    // Получаем текст из weekDisplay
    const weekDisplayText = document.getElementById('weekDisplay').innerText;
    
    // Получаем текст из schedules
    const schedulesText = document.getElementById('schedules').innerText;
    
    // Объединяем с отступом (два переноса строки между ними)
    const textToCopy = `${weekDisplayText}\n\n${schedulesText}`;
    
    // Копируем в буфер обмена
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert('Текст скопирован!');
        
        // Отправляем в Telegram (если нужно)
        const telegramLink = `tg://msg?text=${encodeURIComponent(textToCopy)}`;
        window.open(telegramLink, '_blank');
    }).catch(err => {
        console.error('Ошибка при копировании текста: ', err);
        alert('Не удалось скопировать текст');
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadInitialData();
    
    // Обработчик изменения даты
    document.getElementById('datePicker').addEventListener('change', async (e) => {
        const selectedDate = new Date(e.target.value);
        selectedDate.setHours(0, 0, 0, 0);
        
        const weekNumber = calculateWeekNumber(selectedDate);
        const dayName = dayNames[selectedDate.getDay()]; 
        document.getElementById('weekDisplay').textContent = `${selectedDate.toLocaleDateString()} (${dayName}), ${weekNumber}-я учебная неделя 🗓️`;
        
        await updateSchedule(selectedDate, weekNumber);
    });
});
