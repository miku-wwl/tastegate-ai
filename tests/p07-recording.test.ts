import { describe, expect, it } from "vitest";
import { reviewObservedP07Body } from "../src/qloo/p07-recording";
const place = (id: string, affinity: number) => ({entity_id:id,name:"Authored Museum "+id,type:"urn:entity",subtype:"urn:entity:place",
 properties:{address:"1 Authored Road",website:"https://museum.example/",geocode:{city:"New York",country_code:"US"}},query:{affinity}});
const body = () => ({success:true,results:{entities:[place("authored-one",0.8),place("authored-two",0.6)]},
 query:{localities:{filter:[{name:"New York",subtype:"urn:entity:locality"}]}}});
describe("observed P07 projection, authored wire records only",()=>{
 it("retains ambiguous locality and query-relative order as separate conclusions",()=>{
  expect(reviewObservedP07Body(body())).toEqual({returned:2,observed_locality:"PRESENT_BUT_NAME_AMBIGUOUS",locality_boundary_verified:false,projection_revision:"tastegate.p07.observed-places.v1"});
 });
 it.each(["duplicate","ascending","missing_country","missing_locality","nonfinite","wrong_type"])("rejects %s",damage=>{
  const b=body();
  if(damage==="duplicate")b.results.entities[1]!.entity_id=b.results.entities[0]!.entity_id;
  if(damage==="ascending")b.results.entities[1]!.query.affinity=0.9;
  if(damage==="missing_country")b.results.entities[1]!.properties.geocode.country_code="";
  if(damage==="missing_locality")b.query.localities.filter=[];
  if(damage==="nonfinite")b.results.entities[0]!.query.affinity=Infinity;
  if(damage==="wrong_type")b.results.entities[1]!.subtype="urn:entity:artist";
  expect(()=>reviewObservedP07Body(b)).toThrow();
 });
});
