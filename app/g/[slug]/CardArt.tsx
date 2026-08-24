'use client';
import { type LucideIcon, MessageCircleQuestion, ConciergeBell, Wrench, Sparkles, Wifi, KeyRound, LogOut, MapPin, ClipboardList, Microwave } from 'lucide-react';
const icons:Record<string,LucideIcon>={ask:MessageCircleQuestion,host:ConciergeBell,maintenance:Wrench,extras:Sparkles,wifi:Wifi,checkin:KeyRound,checkout:LogOut,local:MapPin,house_rules:ClipboardList,appliances:Microwave};
export function CardArt({cardKey,size=30}:{cardKey:string;size?:number}){const Icon=icons[cardKey]??Sparkles;return <span className="gp-card-art" aria-hidden><Icon size={size} strokeWidth={1.6}/></span>}
