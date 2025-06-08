
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
            document.getElementById('loading').style.display = 'flex';
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

        function isTimeInSlot(lessonStart, lessonEnd, slotStart, slotEnd) {
            const lessonStartTime = convertToMinutes(lessonStart);
            const lessonEndTime = convertToMinutes(lessonEnd);
            const slotStartTime = convertToMinutes(slotStart);
            const slotEndTime = convertToMinutes(slotEnd);
            
            return (lessonStartTime < slotEndTime && lessonEndTime > slotStartTime);
        }

        function convertToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }

        function getLessonTypeClass(lessonType) {
            const typeMap = {
                'ЛК': 'lecture',
                'ПЗ': 'practice',
                'ЛР': 'lab',
                'Экзамен': 'exam',
                'Консультация': 'consultation',
                'Организация': 'organization',
                'Зачет': 'Test',
                'УПз': 'Instpractice',
                'УЛР': 'Instlab',
                'УЛк': 'Instlecture'
            };
            return typeMap[lessonType] || '';
        }

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

    document.getElementById('loading').style.display = 'flex';
    try {
        const schedulesContainer = document.getElementById('schedules');
        schedulesContainer.innerHTML = '';
        
        // Добавляем пустой угол в левый верхний
        const corner = document.createElement('div');
        corner.className = 'header-cell';
        corner.style.gridColumn = '1';
        corner.style.gridRow = '1';
        schedulesContainer.appendChild(corner);
        
        // Добавляем заголовки аудиторий
        IPEauditories.forEach((auditory, index) => {
            const header = document.createElement('div');
            header.className = 'header-cell auditory-header';
            header.textContent = auditory;
            header.style.gridColumn = index + 2;
            header.style.gridRow = '1';
            schedulesContainer.appendChild(header);
        });
        
        const promises = IPEauditories.map(async (auditory) => {
            const schedule = await getScheduleForAuditory(auditory, date, weekNumber);
            return { auditory, schedule };
        });
        
        const results = await Promise.all(promises);
        
        // Получаем текущее время
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let currentSlotIndex = -1;
        
        // Проверяем, совпадает ли выбранная дата с текущей
        const isToday = date.toDateString() === new Date().toDateString();
        
        // Находим текущий временной интервал
        timeSlotsOrder.forEach((timeSlot, index) => {
            const [start, end] = timeSlot.split('—');
            const startMinutes = convertToMinutes(start);
            const endMinutes = convertToMinutes(end);
            
            if (isToday && currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                currentSlotIndex = index;
            }
        });
        
        // Если текущее время после последнего интервала, выделяем последний
        if (isToday && currentSlotIndex === -1) {
            const lastSlot = timeSlotsOrder[timeSlotsOrder.length - 1];
            const [lastStart, lastEnd] = lastSlot.split('—');
            const lastEndMinutes = convertToMinutes(lastEnd);
            
            if (currentMinutes > lastEndMinutes) {
                currentSlotIndex = timeSlotsOrder.length - 1;
            }
        }
        
        // Если текущее время перед первым интервалом, выделяем первый
        if (isToday && currentSlotIndex === -1) {
            const firstSlot = timeSlotsOrder[0];
            const [firstStart, firstEnd] = firstSlot.split('—');
            const firstStartMinutes = convertToMinutes(firstStart);
            
            if (currentMinutes < firstStartMinutes) {
                currentSlotIndex = 0;
            }
        }
        
        // Добавляем строки для каждого временного интервала
        timeSlotsOrder.forEach((timeSlot, timeIndex) => {
            // Заголовок временного интервала
            const timeHeader = document.createElement('div');
            timeHeader.className = 'time-cell';
            timeHeader.textContent = timeSlot;
            timeHeader.style.gridColumn = '1';
            timeHeader.style.gridRow = timeIndex + 2;
            
            // Подсвечиваем текущий временной интервал
            if (isToday && timeIndex === currentSlotIndex) {
                timeHeader.classList.add('current-time-slot');
            }
            
            schedulesContainer.appendChild(timeHeader);
            
            // Ячейки для каждой аудитории
            results.forEach((result, audIndex) => {
                const cell = document.createElement('div');
                cell.className = 'auditory-cell';
                cell.style.gridColumn = audIndex + 2;
                cell.style.gridRow = timeIndex + 2;
                
                // Подсвечиваем текущий временной интервал в ячейках аудиторий
                if (isToday && timeIndex === currentSlotIndex) {
                    cell.classList.add('current-time-slot');
                }
                
                const lessons = result.schedule[timeSlot];
                if (lessons && lessons.length > 0) {
                    lessons.forEach(lesson => {
                        const lessonDiv = document.createElement('div');
                        const typeClass = getLessonTypeClass(lesson.type);
                        lessonDiv.className = `lesson ${typeClass}`;
                        
                        const startTime = lesson.startTime.substring(0, 5);
                        const endTime = lesson.endTime.substring(0, 5);
                        const groupsText = lesson.groups.length > 0 
                            ? lesson.groups.map(g => 
                                `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="group-link">${g}</a>`
                              ).join(', ')
                            : '';
                        
                        lessonDiv.innerHTML = `
                            <div class="lesson-time">${startTime}—${endTime}</div>
                            <div class="lesson-subject">${lesson.subject}</div>
                            <div class="lesson-type">${lesson.type}</div>
                            ${groupsText ? `<div class="lesson-groups">${groupsText}</div>` : ''}
                            <div>${lesson.teacher}</div>
                        `;
                        cell.appendChild(lessonDiv);
                    });
                } else {
                    const noLessonDiv = document.createElement('div');
                    noLessonDiv.className = 'lesson no-lesson';
                    noLessonDiv.textContent = 'Занятий нет';
                    cell.appendChild(noLessonDiv);
                }
                
                schedulesContainer.appendChild(cell);
            });
        });
        
        // Если текущее время прошло текущий интервал, подсвечиваем следующий
        if (isToday && currentSlotIndex !== -1) {
            const [currentStart, currentEnd] = timeSlotsOrder[currentSlotIndex].split('—');
            const currentEndMinutes = convertToMinutes(currentEnd);
            
            if (currentMinutes > currentEndMinutes && currentSlotIndex < timeSlotsOrder.length - 1) {
                const nextTimeHeaders = schedulesContainer.querySelectorAll(`.time-cell:nth-child(${currentSlotIndex + 3})`);
                const nextAuditoryCells = schedulesContainer.querySelectorAll(`.auditory-cell:nth-child(${currentSlotIndex + 3})`);
                
                nextTimeHeaders.forEach(el => el.classList.add('current-time-slot'));
                nextAuditoryCells.forEach(el => el.classList.add('current-time-slot'));
            }
        }
    } catch (error) {
        console.error('Ошибка при обновлении расписания:', error);
        alert('Произошла ошибка при загрузке расписания');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

        function copyAndSend() {
            const weekDisplayText = document.getElementById('weekDisplay').innerText;
            const schedulesText = document.getElementById('schedules').innerText;
            const textToCopy = `${weekDisplayText}\n\n${schedulesText}`;
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                alert('Текст скопирован!');
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
