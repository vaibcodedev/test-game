/**
 * Деревья поведения жителей (mistreevous 4.3.1, docs/plan/next.md 3.3 шаг 5): текст дерева — data/ai.json (MDSL),
 * узлы — методы агента. Агент горожанина реализует townfolk.ts (CitizenAgent): условия возвращают true/false,
 * действия — State.SUCCEEDED/FAILED (мгновенные: ходьба идёт каждый такт по цели, которую ставит дерево).
 */
import { BehaviourTree, State } from "mistreevous";
type Agent = ConstructorParameters<typeof BehaviourTree>[1];
import AI from "../../../../data/ai.json";
import SCH from "../../../../data/schedules.json";

export { State };
export type Done = State.SUCCEEDED | State.FAILED;

/** Узлы дерева горожанина (data/ai.json trees.citizen). */
export interface CitizenAgent {
  IsChatting(): boolean;
  Chat(): Done;
  ScheduleChanged(): boolean;
  PickSpot(): Done;
  ChangeSpot(): Done;
  HeroClose(): boolean;
  FaceHero(): Done;
  Greet(): Done;
  IsWalking(): boolean;
  MeetsPasserby(): boolean;
  StartChat(): Done;
  Walk(): Done;
  IsBusy(): boolean;
  FaceWork(): Done;
  HasChatPartner(): boolean;
  LookAround(): Done;
}

const C = SCH.chat;
const CITIZEN = AI.trees.citizen.join("\n")
  .replace("$idleWeight", String(C.idleWeight)).replace("$moveWeight", String(C.moveWeight)).replace("$lookWeight", String(C.lookWeight));

/** Дерево горожанина для агента (шаг — tree.step() раз в 200 мс). */
export function citizenTree(agent: CitizenAgent): BehaviourTree {
  return new BehaviourTree(CITIZEN, agent as unknown as Agent);
}
