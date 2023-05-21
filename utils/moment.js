/* eslint-disable no-useless-escape */

class moment {
    constructor() {
    }

    Time = {
        convertTo24Hours: (timeStr) => {

            let [, hourStr, minuteStr] = timeStr.trim().match(/^(\d{1,2})(?::|\s|\.||,)(\d{2})?[ap]m$/i) || [null];
            let hour = parseInt(hourStr);
            let minute = parseInt(minuteStr) || 0;
            let pm = /pm/i.test(timeStr);

            if (hour === 12) {
                hour = pm ? 12 : 0;
            } else if (pm) {
                hour += 12;
            }

            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

        },

        useDateFormat: (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(str => parseInt(str));
            const date = new Date();
            date.setHours(hours);
            date.setMinutes(minutes);
            return date;
        },

        calcDuration(startTime, endTime) {
            startTime = this.convertTo24Hours(startTime)
            endTime = this.convertTo24Hours(endTime)
            startTime = this.useDateFormat(startTime)
            endTime = this.useDateFormat(endTime)

            // Check if endTime is before startTime, and if it is, add a day to endTime
            if (endTime < startTime) {
                const dayInMilliseconds = 24 * 60 * 60 * 1000; // number of milliseconds in a day
                endTime.setTime(endTime.getTime() + dayInMilliseconds);
            }

            return Math.floor((endTime - startTime) / (1000 * 60));

        }
    }

    Date = {
        convertDateFormat(dateString) {
            const currentYear = new Date().getFullYear().toString();
            const addPaddingifSingleNum = (date_string) =>
                date_string.length === 1 ? date_string.toString().padStart(2, '0') : date_string


            const formats = [
                // Matches: DD/MM/YY, where YY represents the last two digits of the current year
                [`/(\d{1,2})\/(\d{1,2})\/${currentYear.slice(2)}/`, (match) => `${currentYear}-${addPaddingifSingleNum(match[2])}-${addPaddingifSingleNum(match[1])}`],

                // Matches: D.M.YYYY or DD.MM.YYYY or DD/MM/YYYY or D/M/YYYY or D/MM/YYYY
                [/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/, (match) => {
                    const day = addPaddingifSingleNum(match[1])
                    const month= addPaddingifSingleNum(match[2])
                    return `${match[3]}-${month}-${day}`;
                }],

                // Matches: DD-MM or DD/MM or D/M or DD/M or D/MM
                [/^(\d{1,2})(?:[-\/\.]?)(\d{1,2})$/, (match) => {
                    const month = addPaddingifSingleNum(match[2]);
                    const day = addPaddingifSingleNum(match[1])
                    return `${currentYear}-${month}-${day}`;
                }],

                // Matches: YYYY/MM/DD
                [/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3'],

                // Matches: DD MonthName, YYYY
                [/(\d{2}) ([a-zA-Z]+)[, ](\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[2]) + '-' + match[1]],

                // Matches: MonthName DD, YYYY
                [/([a-zA-Z]+) (\d{2}), (\d{4})/, (match) => this.formatDateFromMMM(match[1]) + '-' + match[2] + '-' + match[3]],

                // Matches: YYYY-MonthName-DD
                [/(\d{4})-([a-zA-Z]+)-(\d{2})/, (match) => match[1] + '-' + this.formatDateFromMMM(match[2]) + '-' + match[3]],

                // Matches: DDth MonthName YYYY
                [/(\d{2})th ([a-zA-Z]+) (\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[2]) + '-' + this.removeOrdinalSuffix(match[1])],

                // Matches: MonthName DDth, YYYY
                [/([a-zA-Z]+) (\d{2})th, (\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[1]) + '-' + this.removeOrdinalSuffix(match[2])]
            ];


            let date;

            formats.forEach(([format, replacement]) => {
                const match = dateString.match(format);
                if (match) {
                    date = typeof replacement === 'function' ? replacement(match) : dateString.replace(format, replacement);
                    return;
                }
            });

            return date;
        },

        formatDateFromMMM(month) {
            const months = {
                Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
                January: '01', February: '02', March: '03', April: '04', June: '06',
                July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
                Januari: '01', Februari: '02', Mac: '03', Mei: '05',
                Julai: '07', Ogos: '08', Oktober: '10', Disember: '12'
            };

            const monthNormalized = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
            const monthNumber = months[monthNormalized];

            if (monthNumber) {
                return monthNumber;
            } else {
                // Handle invalid month input
                throw new Error("Invalid month: " + month);
            }
        },

        removeOrdinalSuffix(day) {
            return day.replace(/(st|nd|rd|th)/, '');
        }
    }
}

module.exports = {
    moment
}