
class moment {
    constructor() {

    }

    convertTo24Hours(timeStr) {

        let [, hourStr, minuteStr] = timeStr.trim().match(/^(\d{1,2})(?:\:|\s|\.||,)(\d{2})?[ap]m$/i) || [null];
        let hour = parseInt(hourStr);
        let minute = parseInt(minuteStr) || 0;
        let pm = /pm/i.test(timeStr);

        if (hour === 12) {
            hour = pm ? 12 : 0;
        } else if (pm) {
            hour += 12;
        }

        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    }

    useDateFormat(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(str => parseInt(str));
        const date = new Date();
        date.setHours(hours);
        date.setMinutes(minutes);
        return date;
    }

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

module.exports = {
    moment
}