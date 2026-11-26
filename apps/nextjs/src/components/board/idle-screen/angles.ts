export interface ClockAngles {
  hour: number;
  minute: number;
  second: number;
}

/** Hand angles in degrees, measured clockwise from 12 o'clock. */
export const getClockAngles = (date: Date, showSeconds: boolean): ClockAngles => {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;
  return {
    hour: hours * 30,
    minute: minutes * 6,
    second: showSeconds ? seconds * 6 : 0,
  };
};
