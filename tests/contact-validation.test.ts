import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLead} from '../app/api/contact/validation.ts';

test('contact submissions are normalized and rejected when invalid',()=>{
  assert.deepEqual(parseLead({name:' James ',email:'JAMES@OXYGN.XYZ',institution:'Oxygn',message:' Hello '}),{name:'James',email:'james@oxygn.xyz',institution:'Oxygn',message:'Hello'});
  assert.equal(parseLead({name:'James',email:'bad',message:'Hello'}),null);
  assert.equal(parseLead({name:'James',email:'james@oxygn.xyz',message:'Hello',website:'spam'}),null);
});
