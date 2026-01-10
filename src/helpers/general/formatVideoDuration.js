export const formatVideoDuration = async (duration, videoType) => {
  let retDuration = "";
  if (duration && videoType) {
    if (videoType == "youtube") {
      // Remove the "PT" prefix from the duration
      let timing = duration.replace("PT", "");

      // Extract the hours, minutes, and seconds from the duration string
      const hours = parseInt(timing.substring(0, timing.indexOf("H")));
      const minutes = parseInt(timing.substring(timing.indexOf("H") + 1, timing.indexOf("M")));
      const seconds = parseInt(timing.substring(timing.indexOf("M") + 1, timing.indexOf("S")));
      let formattedTime = "";
      // Format the time as "H:MM:SS"
      if (!hours) {
        if (!minutes) formattedTime = `00:${seconds.toString().padStart(2, "0")}`;
        else
          formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`;
      } else {
        formattedTime = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }
      retDuration = formattedTime;
    }
    if (videoType == "vimeo") {
      let sec = duration;
      let hours = Math.floor(sec / 3600);
      hours >= 1 ? (sec = sec - hours * 3600) : (hours = "");
      var min = Math.floor(sec / 60);
      min >= 1 ? (sec = sec - min * 60) : (min = "00");
      sec < 1 ? (sec = "00") : void 0;

      min.toString().length == 1 ? (min = "0" + min) : void 0;
      sec.toString().length == 1 ? (sec = "0" + sec) : void 0;
      if (hours == "") {
        retDuration = min + ":" + sec;
      } else {
        retDuration = hours + ":" + min + ":" + sec;
      }
    }
  }
  return retDuration;
};
