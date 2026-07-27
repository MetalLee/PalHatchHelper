export const brand = {
  name: "PalBeacon",
  productName: "帕鲁服务器控制台",
  englishProductName: "Palworld Server Console",
  tagline: "时刻掌握你的帕鲁世界。",
  englishTagline: "Keep your world visible.",
  description:
    "面向《幻兽帕鲁》私人服务器的数据监控、帕鲁库存与配种协作控制台。",
  summary: "服务器状态、帕鲁库存与配种计划，尽在一个看板。",
  logoPath: "/brand/palbeacon-logo.png",
} as const;

export const brandTitle = `${brand.name}｜${brand.productName}`;
export const brandLogoAlt = `${brand.name} ${brand.productName}`;
