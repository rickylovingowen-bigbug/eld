export type Locale = "en" | "zh";

export interface Dictionary {
  memoir: string;
  languageEn: string;
  languageZh: string;
  morning: string;
  afternoon: string;
  evening: string;
  greet: (part: string, name: string) => string;
  welcomeTitle: (name: string) => string;
  welcomeBody: string;
  progress: (count: number) => string;
  continueKicker: string;
  continue: string;
  lastTime: (text: string) => string;
  orTry: string;
  seeAll: string;
  hideAll: string;
  notNow: string;
  start: string;
  dontAsk: string;
  dontAskConfirm: string;
  askAgain: string;
  freeTalk: string;
  myMemoir: string;
  allDone: string;
  growingUp: string;
  home: string;
  changeTopic: string;
  skipTopic: string;
  doneToday: string;
  savedAsYouGo: string;
  send: string;
  thinking: string;
  answerSaved: string;
  tryAgain: string;
  sendFailed: string;
  showEarlier: string;
  hideEarlier: string;
  placeholder: string;
  bookPlaceholder: string;
  reviewPlaceholder: string;
  backHome: string;
  sensitive: string;
}

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    memoir: "Memoir",
    languageEn: "EN",
    languageZh: "中文",
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    greet: (part, name) => `${part}, ${name}`,
    welcomeTitle: (name) => `Welcome, ${name}`,
    welcomeBody: "I'll ask about when you were growing up. You type your answers, and I'll listen.",
    progress: (count) =>
      count === 1 ? "You've shared 1 story about growing up." : `You've shared ${count} stories about growing up.`,
    continueKicker: "Pick up where you left off",
    continue: "Continue",
    lastTime: (text) => `Last time: ${text}`,
    orTry: "Or try one of these",
    seeAll: "See all topics",
    hideAll: "Hide topics",
    notNow: "Not now",
    start: "Start",
    dontAsk: "Don't ask me about this",
    dontAskConfirm: "Leave this out",
    askAgain: "Ask me about this again",
    freeTalk: "Something else on your mind?",
    myMemoir: "My memoir",
    allDone: "You've told a full picture of growing up. You can talk freely, or open My memoir when the chapter is ready.",
    growingUp: "Growing up",
    home: "Home",
    changeTopic: "Change topic",
    skipTopic: "Skip this topic for now",
    doneToday: "Done for today",
    savedAsYouGo: "Saved as you go",
    send: "Send",
    thinking: "Thinking…",
    answerSaved: "Your answer is saved",
    tryAgain: "Try again",
    sendFailed: "Couldn't send that. Your words are still here.",
    showEarlier: "Show earlier answers",
    hideEarlier: "Hide earlier answers",
    placeholder: "Type your answer",
    bookPlaceholder: "Your book will gather here. Putting the chapter together comes in a later version.",
    reviewPlaceholder: "Your words are saved. Turning them into a story comes in the next version.",
    backHome: "Back home",
    sensitive: "Only if you want to",
  },
  zh: {
    memoir: "回忆录",
    languageEn: "EN",
    languageZh: "中文",
    morning: "早上好",
    afternoon: "下午好",
    evening: "晚上好",
    greet: (part, name) => `${part}，${name}`,
    welcomeTitle: (name) => `欢迎，${name}`,
    welcomeBody: "我会问一些小时候的事。你打字回答就好，我听着。",
    progress: (count) => `你已经讲了 ${count} 段小时候的故事。`,
    continueKicker: "接着上次",
    continue: "继续",
    lastTime: (text) => `上次：${text}`,
    orTry: "或者换一个",
    seeAll: "全部话头",
    hideAll: "收起话头",
    notNow: "先不聊",
    start: "开始",
    dontAsk: "以后别问这个",
    dontAskConfirm: "不再问这个",
    askAgain: "可以再问这个",
    freeTalk: "想讲点别的？",
    myMemoir: "我的回忆录",
    allDone: "童年这一章你已经讲得很完整了。可以自由讲，或等下一版整理成章。",
    growingUp: "小时候",
    home: "首页",
    changeTopic: "换个话题",
    skipTopic: "先不聊这个",
    doneToday: "今天先到这",
    savedAsYouGo: "边讲边存",
    send: "发送",
    thinking: "思考中…",
    answerSaved: "你的话已经存好了",
    tryAgain: "再试一次",
    sendFailed: "没发出去。你打的字还在。",
    showEarlier: "看更早的回答",
    hideEarlier: "收起更早的回答",
    placeholder: "写下你的回答",
    bookPlaceholder: "书会慢慢厚起来。整理成章在后面的版本。",
    reviewPlaceholder: "你的原话已经存好。整理成故事在下一版。",
    backHome: "回首页",
    sensitive: "只有你想说的时候",
  },
};

export function greetingPart(date: Date, dictionary: Dictionary): string {
  const hour = date.getHours();
  if (hour < 12) return dictionary.morning;
  if (hour < 17) return dictionary.afternoon;
  return dictionary.evening;
}
