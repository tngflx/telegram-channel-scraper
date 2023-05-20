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
        dateFormats: [
            /(\d{2})\/(\d{2})\/(\d{4})/,            // MM/DD/YYYY
            /(\d{2})-(\d{2})-(\d{4})/,               // DD-MM-YYYY
            /(\d{4})\/(\d{2})\/(\d{2})/,             // YYYY/MM/DD
            /([a-zA-Z]+) (\d{2}), (\d{4})/,           // MMM DD, YYYY
            /(\d{4})-([a-zA-Z]+)-(\d{2})/,            // YYYY-MMM-DD
            /(\d{2})th ([a-zA-Z]+) (\d{4})/,          // DDth MMM YYYY
            /(\d{2}) ([a-zA-Z]+), (\d{4})/,           // DD MMM, YYYY
            /([a-zA-Z]+) (\d{2})th, (\d{4})/,          // MMM DDth, YYYY
            /(\d{2})\.(\d{2})\.(\d{2,4})/               // DD.MM.YY or YYYY
        ],

        convertDateFormat(dateString) {
            const currentYear = new Date().getFullYear();
            const addPaddingifSingleNum = (date_string) =>
                date_string.length === 1 ? date_string : date_string.toString().padStart(2, '0')


            const formats = [
                [/(\d{2})\/(\d{2})\/23/, `${currentYear}-$2-$1`],
                [/(\d{2})\/(\d{1,2})\/(\d{4})/, (match) => { match[3] + '-' + addPaddingifSingleNum(match[2]) + '-' + match[1] }],
                [/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1'],
                [/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3'],
                [/([a-zA-Z]+) (\d{2}), (\d{4})/, (match) => this.formatDateFromMMM(match[1]) + '-' + match[2] + '-' + match[3]],
                [/(\d{4})-([a-zA-Z]+)-(\d{2})/, (match) => match[1] + '-' + this.formatDateFromMMM(match[2]) + '-' + match[3]],
                [/(\d{2})th ([a-zA-Z]+) (\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[2]) + '-' + this.removeOrdinalSuffix(match[1])],
                [/(\d{2}) ([a-zA-Z]+)[, ](\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[2]) + '-' + match[1]],
                [/([a-zA-Z]+) (\d{2})th, (\d{4})/, (match) => match[3] + '-' + this.formatDateFromMMM(match[1]) + '-' + this.removeOrdinalSuffix(match[2])],
                [/^(\d{2})(?:[-\/\.]?)(\d{1,2})$/, (match) => {
                    const month = addPaddingifSingleNum(match[2]);
                    const day = match[1].toString().padStart(2, '0');
                    return `${currentYear}-${month}-${day}`;
                }],
                [/(\d{2})\.(\d{2})\.(\d{2,4})/, (match) => {
                    if (match[3].length === 2) {
                        match[3] = '20' + match[3];
                    }
                    return match[3] + '-' + match[2] + '-' + match[1];
                }]
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